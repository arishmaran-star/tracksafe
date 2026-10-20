
"""
TRACKSAFE: AI-POWERED RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM
Google OR-Tools CP-SAT Scheduler
Planning horizon: 7 days
Minimum maintenance block: 180 minutes
"""

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List

from sqlalchemy import and_
from sqlalchemy.orm import Session
from ortools.sat.python import cp_model

from database import (
    MaintenanceBlock,
    BlockTask,
    Defect,
    TrainMovement,
    Asset,
)


HORIZON_MINUTES = 7 * 24 * 60
MIN_BLOCK_DURATION = 180
MAX_BLOCK_DURATION = 480
SOLVER_TIME_LIMIT_SECONDS = 15


def run_cp_sat_scheduler(db: Session) -> Dict[str, Any]:
    """
    Generate a conflict-free maintenance schedule for seven days.

    Rules:
    1. Schedule pending defects wherever feasible.
    2. Give emergency defects higher priority.
    3. Never overlap maintenance blocks with train movements
       on the same track.
    4. Enforce a minimum block duration of 180 minutes.
    5. Create no empty maintenance blocks.
    6. Save proposed blocks and their assigned defects.
    """

    horizon_start = datetime.combine(date.today(), time.min)
    horizon_end = horizon_start + timedelta(
        minutes=HORIZON_MINUTES
    )

    # ---------------------------------------------------------
    # 1. Fetch pending defects and their associated assets
    # ---------------------------------------------------------
    pending_defects = (
        db.query(Defect)
        .join(Asset, Defect.AssetID == Asset.AssetID)
        .filter(Defect.Status == "Pending")
        .all()
    )

    if not pending_defects:
        return {
            "status": "NO_WORK",
            "message": "No pending defects found.",
            "blocks_created": 0,
            "defects_scheduled": 0,
            "unscheduled_defects": 0,
            "solver_objective_value": 0.0,
        }

    defects_by_track: Dict[int, List[Defect]] = {}

    for defect in pending_defects:
        track_id = defect.asset.TrackID

        if track_id is None:
            continue

        defects_by_track.setdefault(track_id, []).append(defect)

    if not defects_by_track:
        return {
            "status": "NO_WORK",
            "message": "No pending defects have a valid track.",
            "blocks_created": 0,
            "defects_scheduled": 0,
            "unscheduled_defects": len(pending_defects),
            "solver_objective_value": 0.0,
        }

    # ---------------------------------------------------------
    # 2. Fetch every train movement overlapping the horizon
    # ---------------------------------------------------------
    train_movements = (
        db.query(TrainMovement)
        .filter(
            and_(
                TrainMovement.Entry_Time < horizon_end,
                TrainMovement.Exit_Time > horizon_start,
            )
        )
        .all()
    )

    movements_by_track = {}

    for movement in train_movements:
        movements_by_track.setdefault(
            movement.TrackID, []
        ).append(movement)

    # ---------------------------------------------------------
    # 3. Build the CP-SAT optimization model
    # ---------------------------------------------------------
    model = cp_model.CpModel()

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = (
        SOLVER_TIME_LIMIT_SECONDS
    )
    solver.parameters.num_search_workers = 8

    block_variables = {}
    assignment_variables = {}
    objective_terms = []

    # Assignment rewards are scaled so that the objective first
    # favors scheduling defects, then favors emergencies, and
    # then prefers earlier emergency maintenance.
    time_scale = HORIZON_MINUTES + 1

    for track_id, track_defects in defects_by_track.items():

        # Candidate blocks are limited to four per track.
        # Increase this limit if the project requires more blocks.
        num_candidates = min(
            4, len(track_defects)
        )

        track_intervals = []
        block_variables[track_id] = []

        # Add fixed intervals for trains on this track.
        for index, movement in enumerate(
            movements_by_track.get(track_id, [])
        ):
            start_minute = max(
                0,
                int(
                    (
                        movement.Entry_Time - horizon_start
                    ).total_seconds() // 60
                ),
            )

            end_minute = min(
                HORIZON_MINUTES,
                int(
                    (
                        movement.Exit_Time - horizon_start
                    ).total_seconds() // 60
                ),
            )

            if end_minute <= start_minute:
                continue

            train_interval = model.NewIntervalVar(
                start_minute,
                end_minute - start_minute,
                end_minute,
                f"train_{track_id}_{index}",
            )

            track_intervals.append(train_interval)

        # Create optional maintenance intervals.
        for block_index in range(num_candidates):

            active = model.NewBoolVar(
                f"active_track_{track_id}_block_{block_index}"
            )

            start = model.NewIntVar(
                0,
                HORIZON_MINUTES - MIN_BLOCK_DURATION,
                f"start_track_{track_id}_block_{block_index}",
            )

            duration = model.NewIntVar(
                MIN_BLOCK_DURATION,
                MAX_BLOCK_DURATION,
                f"duration_track_{track_id}_block_{block_index}",
            )

            end = model.NewIntVar(
                MIN_BLOCK_DURATION,
                HORIZON_MINUTES,
                f"end_track_{track_id}_block_{block_index}",
            )

            interval = model.NewOptionalIntervalVar(
                start,
                duration,
                end,
                active,
                f"maintenance_track_{track_id}_block_{block_index}",
            )

            track_intervals.append(interval)

            block_variables[track_id].append({
                "index": block_index,
                "active": active,
                "start": start,
                "duration": duration,
                "end": end,
            })

        # Trains and maintenance blocks cannot overlap.
        model.AddNoOverlap(track_intervals)

        # -----------------------------------------------------
        # 4. Assign defects to candidate maintenance blocks
        # -----------------------------------------------------
        for block in block_variables[track_id]:

            block_index = block["index"]
            assignments = []
            emergency_assignments = []

            for defect in track_defects:

                assignment = model.NewBoolVar(
                    f"defect_{defect.DefectID}_block_{block_index}_track_{track_id}"
                )

                assignment_variables[
                    (defect.DefectID, track_id, block_index)
                ] = assignment

                assignments.append(assignment)

                # A defect can only be assigned to an active block.
                model.AddImplication(
                    assignment, block["active"]
                )

                # Reward scheduling defects according to severity.
                severity = max(
                    0, int(defect.Severity_Score or 0)
                )

                is_emergency = bool(defect.Is_Emergency)

                # Severity and emergency priority are integer rewards.
                # The time scale makes assignment rewards larger
                # than the maximum possible start-time penalty.
                reward = (
                    time_scale * (100 + severity)
                )

                if is_emergency:
                    reward += time_scale * 10000
                    emergency_assignments.append(assignment)

                objective_terms.append(
                    reward * assignment
                )

            # Every active block must contain at least one defect.
            model.Add(
                sum(assignments) >= 1
            ).OnlyEnforceIf(block["active"])

            # Emergency flag for this block.
            emergency_active = model.NewBoolVar(
                f"emergency_track_{track_id}_block_{block_index}"
            )

            if emergency_assignments:
                model.Add(
                    sum(emergency_assignments) >= 1
                ).OnlyEnforceIf(emergency_active)

                model.Add(
                    sum(emergency_assignments) == 0
                ).OnlyEnforceIf(emergency_active.Not())
            else:
                model.Add(emergency_active == 0)

            # Apply the start-time penalty ONLY when the block
            # contains an emergency defect.
            emergency_start = model.NewIntVar(
                0,
                HORIZON_MINUTES,
                f"emergency_start_track_{track_id}_block_{block_index}",
            )

            model.Add(
                emergency_start == block["start"]
            ).OnlyEnforceIf(emergency_active)

            model.Add(
                emergency_start == 0
            ).OnlyEnforceIf(emergency_active.Not())

            objective_terms.append(
                -emergency_start
            )

        # Each defect may be scheduled at most once.
        for defect in track_defects:
            defect_assignments = [
                assignment_variables[
                    (
                        defect.DefectID,
                        track_id,
                        block["index"],
                    )
                ]
                for block in block_variables[track_id]
            ]

            model.Add(
                sum(defect_assignments) <= 1
            )

    # Maximize scheduled work and emergency priority while
    # minimizing the start times of blocks containing emergencies.
    model.Maximize(sum(objective_terms))

    # ---------------------------------------------------------
    # 5. Solve the optimization model
    # ---------------------------------------------------------
    solver_status = solver.Solve(model)

    if solver_status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE,
    ):
        return {
            "status": "INFEASIBLE",
            "message": (
                "The solver could not find a feasible schedule. "
                "Review the train timetable and planning constraints."
            ),
            "blocks_created": 0,
            "defects_scheduled": 0,
            "unscheduled_defects": len(pending_defects),
            "solver_objective_value": 0.0,
        }

    # ---------------------------------------------------------
    # 6. Prepare the database changes
    # ---------------------------------------------------------
    created_blocks = 0
    scheduled_defect_ids = set()

    try:
        # Remove only previous AI-proposed blocks.
        # Restore their defects to Pending before rebuilding.
        old_blocks = (
            db.query(MaintenanceBlock)
            .filter(
                MaintenanceBlock.Block_Status == "AI_Proposed"
            )
            .all()
        )

        for old_block in old_blocks:
            for task in old_block.tasks:
                task.defect.Status = "Pending"

            db.delete(old_block)

        db.flush()

        # Save newly generated maintenance blocks.
        for track_id, blocks in block_variables.items():

            for block in blocks:

                if solver.Value(block["active"]) != 1:
                    continue

                assigned_defects = []

                for defect in defects_by_track[track_id]:
                    assignment = assignment_variables[
                        (
                            defect.DefectID,
                            track_id,
                            block["index"],
                        )
                    ]

                    if solver.Value(assignment) == 1:
                        assigned_defects.append(defect)

                # Defensive validation: never save an empty block.
                if not assigned_defects:
                    continue

                start_minute = solver.Value(block["start"])
                end_minute = solver.Value(block["end"])

                start_datetime = (
                    horizon_start
                    + timedelta(minutes=start_minute)
                )

                end_datetime = (
                    horizon_start
                    + timedelta(minutes=end_minute)
                )

                # Validate the generated interval before saving.
                duration_minutes = (
                    end_minute - start_minute
                )

                if not (
                    MIN_BLOCK_DURATION
                    <= duration_minutes
                    <= MAX_BLOCK_DURATION
                ):
                    raise ValueError(
                        "Generated block has an invalid duration."
                    )

                new_block = MaintenanceBlock(
                    TrackID=track_id,
                    Start_Time=start_datetime,
                    End_Time=end_datetime,
                    Block_Status="AI_Proposed",
                )

                db.add(new_block)
                db.flush()

                created_blocks += 1

                for defect in assigned_defects:
                    task = BlockTask(
                        BlockID=new_block.blockid,
                        DefectID=defect.defectid,
                    )

                    db.add(task)
                    defect.Status = "Scheduled"

                    scheduled_defect_ids.add(
                        defect.DefectID
                    )

        db.commit()

    except Exception:
        db.rollback()
        raise

    # ---------------------------------------------------------
    # 7. Return a summary for FastAPI or other callers
    # ---------------------------------------------------------
    total_scheduled = len(scheduled_defect_ids)

    return {
        "status": (
            "OPTIMAL"
            if solver_status == cp_model.OPTIMAL
            else "FEASIBLE"
        ),
        "message": (
            f"Generated {created_blocks} proposed maintenance "
            f"block(s) and scheduled {total_scheduled} defect(s)."
        ),
        "planning_horizon_start": horizon_start.isoformat(),
        "planning_horizon_end": horizon_end.isoformat(),
        "blocks_created": created_blocks,
        "defects_scheduled": total_scheduled,
        "unscheduled_defects": (
            len(pending_defects) - total_scheduled
        ),
        "solver_objective_value": float(
            solver.ObjectiveValue()
        ),
    }
