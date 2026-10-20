"""
TRACKSAFE: AI-POWERED RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM
Google OR-Tools CP-SAT Scheduler (Pure Raw SQL Edition)
Planning horizon: 7 days
Minimum maintenance block: 180 minutes
"""

from datetime import date, datetime, time, timedelta
from typing import Any, Dict, List
from ortools.sat.python import cp_model

HORIZON_MINUTES = 7 * 24 * 60
MIN_BLOCK_DURATION = 180
MAX_BLOCK_DURATION = 480
SOLVER_TIME_LIMIT_SECONDS = 15


def run_cp_sat_scheduler(conn) -> Dict[str, Any]:
    """
    Generate a conflict-free maintenance schedule using pure raw SQL queries.
    """
    horizon_start = datetime.combine(date.today(), time.min)
    horizon_end = horizon_start + timedelta(minutes=HORIZON_MINUTES)

    cursor = conn.cursor()

    try:
        # ---------------------------------------------------------
        # 1. Fetch pending defects and their associated assets via Raw SQL JOIN
        # ---------------------------------------------------------
        query_defects = """
            SELECT d.DefectID, d.AssetID, d.Severity_Score, d.Is_Emergency, d.Status, a.TrackID
            FROM Defects d
            JOIN Assets a ON d.AssetID = a.AssetID
            WHERE d.Status = 'Pending';
        """
        cursor.execute(query_defects)
        pending_defects = cursor.fetchall()

        if not pending_defects:
            return {
                "status": "NO_WORK",
                "message": "No pending defects found.",
                "blocks_created": 0,
                "defects_scheduled": 0,
                "unscheduled_defects": 0,
                "solver_objective_value": 0.0,
            }

        defects_by_track: Dict[int, List[Dict[str, Any]]] = {}

        for defect in pending_defects:
            track_id = defect['trackid']
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
        # 2. Fetch every train movement overlapping the horizon via Raw SQL
        # ---------------------------------------------------------
        query_trains = """
            SELECT MovementID, TrainID, TrackID, Entry_Time, Exit_Time
            FROM Train_Movements
            WHERE Entry_Time < %s AND Exit_Time > %s;
        """
        cursor.execute(query_trains, (horizon_end, horizon_start))
        train_movements = cursor.fetchall()

        movements_by_track = {}
        for movement in train_movements:
            movements_by_track.setdefault(movement['trackid'], []).append(movement)

        # ---------------------------------------------------------
        # 3. Build the CP-SAT optimization model
        # ---------------------------------------------------------
        model = cp_model.CpModel()
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = SOLVER_TIME_LIMIT_SECONDS
        solver.parameters.num_search_workers = 8

        block_variables = {}
        assignment_variables = {}
        objective_terms = []
        time_scale = HORIZON_MINUTES + 1

        for track_id, track_defects in defects_by_track.items():
            num_candidates = min(4, len(track_defects))
            track_intervals = []
            block_variables[track_id] = []

            # Add fixed intervals for trains on this track
            for index, movement in enumerate(movements_by_track.get(track_id, [])):
                start_minute = max(
                    0, int((movement['entry_time'] - horizon_start).total_seconds() // 60)
                )
                end_minute = min(
                    HORIZON_MINUTES, int((movement['exit_time'] - horizon_start).total_seconds() // 60)
                )

                if end_minute <= start_minute:
                    continue

                train_interval = model.NewIntervalVar(
                    start_minute, end_minute - start_minute, end_minute, f"train_{track_id}_{index}"
                )
                track_intervals.append(train_interval)

            # Create optional maintenance intervals
            for block_index in range(num_candidates):
                active = model.NewBoolVar(f"active_track_{track_id}_block_{block_index}")
                start = model.NewIntVar(0, HORIZON_MINUTES - MIN_BLOCK_DURATION, f"start_track_{track_id}_block_{block_index}")
                duration = model.NewIntVar(MIN_BLOCK_DURATION, MAX_BLOCK_DURATION, f"duration_track_{track_id}_block_{block_index}")
                end = model.NewIntVar(MIN_BLOCK_DURATION, HORIZON_MINUTES, f"end_track_{track_id}_block_{block_index}")

                interval = model.NewOptionalIntervalVar(start, duration, end, active, f"maintenance_track_{track_id}_block_{block_index}")
                track_intervals.append(interval)

                block_variables[track_id].append({
                    "index": block_index,
                    "active": active,
                    "start": start,
                    "duration": duration,
                    "end": end,
                })

            model.AddNoOverlap(track_intervals)

            # -----------------------------------------------------
            # 4. Assign defects to candidate maintenance blocks
            # -----------------------------------------------------
            for block in block_variables[track_id]:
                block_index = block["index"]
                assignments = []
                emergency_assignments = []

                for defect in track_defects:
                    defect_id = defect['defectid']
                    assignment = model.NewBoolVar(f"defect_{defect_id}_block_{block_index}_track_{track_id}")
                    assignment_variables[(defect_id, track_id, block_index)] = assignment
                    assignments.append(assignment)

                    model.AddImplication(assignment, block["active"])

                    severity = max(0, int(defect['severity_score'] or 0))
                    is_emergency = bool(defect['is_emergency'])

                    reward = time_scale * (100 + severity)
                    if is_emergency:
                        reward += time_scale * 10000
                        emergency_assignments.append(assignment)

                    objective_terms.append(reward * assignment)

                model.Add(sum(assignments) >= 1).OnlyEnforceIf(block["active"])

                emergency_active = model.NewBoolVar(f"emergency_track_{track_id}_block_{block_index}")
                if emergency_assignments:
                    model.Add(sum(emergency_assignments) >= 1).OnlyEnforceIf(emergency_active)
                    model.Add(sum(emergency_assignments) == 0).OnlyEnforceIf(emergency_active.Not())
                else:
                    model.Add(emergency_active == 0)

                emergency_start = model.NewIntVar(0, HORIZON_MINUTES, f"emergency_start_track_{track_id}_block_{block_index}")
                model.Add(emergency_start == block["start"]).OnlyEnforceIf(emergency_active)
                model.Add(emergency_start == 0).OnlyEnforceIf(emergency_active.Not())

                objective_terms.append(-emergency_start)

            for defect in track_defects:
                defect_id = defect['defectid']
                defect_assignments = [
                    assignment_variables[(defect_id, track_id, block["index"])]
                    for block in block_variables[track_id]
                ]
                model.Add(sum(defect_assignments) <= 1)

        model.Maximize(sum(objective_terms))

        # ---------------------------------------------------------
        # 5. Solve the optimization model
        # ---------------------------------------------------------
        solver_status = solver.Solve(model)

        if solver_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return {
                "status": "INFEASIBLE",
                "message": "The solver could not find a feasible schedule.",
                "blocks_created": 0,
                "defects_scheduled": 0,
                "unscheduled_defects": len(pending_defects),
                "solver_objective_value": 0.0,
            }

        # ---------------------------------------------------------
        # 6. Prepare and execute database changes via Raw SQL
        # ---------------------------------------------------------
        # Remove previous AI-proposed blocks and restore defects to Pending
        cursor.execute("SELECT BlockID FROM Maintenance_Blocks WHERE Block_Status = 'AI_Proposed';")
        old_blocks = cursor.fetchall()

        for old_b in old_blocks:
            b_id = old_b['blockid']
            cursor.execute("UPDATE Defects SET Status = 'Pending' WHERE DefectID IN (SELECT DefectID FROM Block_Tasks WHERE BlockID = %s);", (b_id,))
            cursor.execute("DELETE FROM Block_Tasks WHERE BlockID = %s;", (b_id,))
            cursor.execute("DELETE FROM Maintenance_Blocks WHERE BlockID = %s;", (b_id,))

        created_blocks = 0
        scheduled_defect_ids = set()

        for track_id, blocks in block_variables.items():
            for block in blocks:
                if solver.Value(block["active"]) != 1:
                    continue

                assigned_defects = []
                for defect in defects_by_track[track_id]:
                    defect_id = defect['defectid']
                    assignment = assignment_variables[(defect_id, track_id, block["index"])]
                    if solver.Value(assignment) == 1:
                        assigned_defects.append(defect)

                if not assigned_defects:
                    continue

                start_minute = solver.Value(block["start"])
                end_minute = solver.Value(block["end"])

                start_datetime = horizon_start + timedelta(minutes=start_minute)
                end_datetime = horizon_start + timedelta(minutes=end_minute)

                duration_minutes = end_minute - start_minute
                if not (MIN_BLOCK_DURATION <= duration_minutes <= MAX_BLOCK_DURATION):
                    raise ValueError("Generated block has an invalid duration.")

                # Insert new maintenance block using raw SQL
                cursor.execute(
                    """
                    INSERT INTO Maintenance_Blocks (TrackID, Start_Time, End_Time, Block_Status)
                    VALUES (%s, %s, %s, 'AI_Proposed')
                    RETURNING BlockID;
                    """,
                    (track_id, start_datetime, end_datetime)
                )
                new_block_id = cursor.fetchone()['blockid']
                created_blocks += 1

                for defect in assigned_defects:
                    defect_id = defect['defectid']
                    cursor.execute(
                        "INSERT INTO Block_Tasks (BlockID, DefectID) VALUES (%s, %s);",
                        (new_block_id, defect_id)
                    )
                    cursor.execute(
                        "UPDATE Defects SET Status = 'Scheduled' WHERE DefectID = %s;",
                        (defect_id,)
                    )
                    scheduled_defect_ids.add(defect_id)

        conn.commit()

        total_scheduled = len(scheduled_defect_ids)
        return {
            "status": "OPTIMAL" if solver_status == cp_model.OPTIMAL else "FEASIBLE",
            "message": f"Generated {created_blocks} proposed maintenance block(s) and scheduled {total_scheduled} defect(s) using Raw SQL.",
            "planning_horizon_start": horizon_start.isoformat(),
            "planning_horizon_end": horizon_end.isoformat(),
            "blocks_created": created_blocks,
            "defects_scheduled": total_scheduled,
            "unscheduled_defects": len(pending_defects) - total_scheduled,
            "solver_objective_value": float(solver.ObjectiveValue()),
        }

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()