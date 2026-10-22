"""
TRACKSAFE: RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM (KATPADI REGION)
Google OR-Tools CP-SAT Scheduling Algorithm (Strict Pure Raw SQL Edition)

CORE SPECIFICATIONS:
1. Planning Horizon: Exactly 1-week (7 days = 10,080 minutes).
2. Dynamic Duration Logic:
   - If requested time < 180 minutes: Block duration is forced to exactly 180 minutes (3-hour safety minimum).
   - If requested time >= 180 minutes: Block duration equals the requested time.
3. Emergency Targeting (24-Hour Rule):
   - Aggressively attempts to schedule emergency defects within the first 24 hours (1,440 minutes).
   - If a 24-hour gap is mathematically impossible due to train movements, falls back to the next immediate possible gap within the 7-day horizon.
4. Infeasible Fallback Message:
   - Returns exact string: "There is no required gap for block allocation. Suggest taking manual action."
5. Pure Raw SQL: Strictly psycopg2 with RealDictCursor against Supabase PostgreSQL.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List
from ortools.sat.python import cp_model

HORIZON_MINUTES = 7 * 24 * 60  # 7 days = 10,080 minutes
TWENTY_FOUR_HOURS = 24 * 60    # 1,440 minutes
MIN_SAFETY_DURATION = 180      # Strict 3-hour minimum
SOLVER_TIME_LIMIT_SECONDS = 20

INFEASIBLE_MESSAGE = "There is no required gap for block allocation. Suggest taking manual action."


def merge_intervals(intervals: List[Dict[str, int]]) -> List[Dict[str, int]]:
    """
    Merges overlapping or contiguous train intervals on a track.
    Ensures AddNoOverlap receives strictly disjoint train intervals.
    """
    if not intervals:
        return []
    sorted_ints = sorted(intervals, key=lambda x: (x["start"], x["end"]))
    merged = []
    for cur in sorted_ints:
        if not merged:
            merged.append(dict(cur))
        else:
            prev = merged[-1]
            if cur["start"] <= prev["end"]:
                new_end = max(prev["end"], cur["end"])
                merged[-1]["end"] = new_end
                merged[-1]["duration"] = new_end - prev["start"]
            else:
                merged.append(dict(cur))
    return merged


def run_cp_sat_scheduler(conn) -> Dict[str, Any]:
    """
    Executes CP-SAT scheduler reading strictly from Supabase Defects and Train_Movements,
    and writing Maintenance_Blocks and Block_Tasks back to Supabase.
    """
    now = datetime.now()
    horizon_end = now + timedelta(minutes=HORIZON_MINUTES)

    cursor = conn.cursor()

    try:
        # ---------------------------------------------------------
        # 1. Reset previous unapproved Algorithm_Proposed blocks in Supabase
        # ---------------------------------------------------------
        cursor.execute("""
            SELECT BlockID FROM Maintenance_Blocks 
            WHERE Block_Status IN ('Algorithm_Proposed', 'AI_Proposed');
        """)
        old_blocks = cursor.fetchall()

        for old_b in old_blocks:
            b_id = old_b['blockid']
            cursor.execute(
                "UPDATE Defects SET Status = 'Pending' WHERE DefectID IN (SELECT DefectID FROM Block_Tasks WHERE BlockID = %s);",
                (b_id,)
            )
            cursor.execute("DELETE FROM Block_Tasks WHERE BlockID = %s;", (b_id,))
            cursor.execute("DELETE FROM Maintenance_Blocks WHERE BlockID = %s;", (b_id,))

        # ---------------------------------------------------------
        # 2. Fetch pending defects from Supabase via Pure Raw SQL
        # ---------------------------------------------------------
        query_defects = """
            SELECT 
                d.DefectID, 
                d.AssetID, 
                d.Severity_Score, 
                d.Is_Emergency, 
                COALESCE(d.Estimated_Mins, 60) AS Estimated_Mins, 
                d.Status, 
                a.TrackID
            FROM Defects d
            JOIN Assets a ON d.AssetID = a.AssetID
            WHERE d.Status = 'Pending'
            ORDER BY d.Is_Emergency DESC, d.DefectID ASC;
        """
        cursor.execute(query_defects)
        pending_defects = cursor.fetchall()

        if not pending_defects:
            return {
                "status": "NO_WORK",
                "success": True,
                "message": "No pending defects found in Katpadi region.",
                "blocks_created": 0,
                "defects_scheduled": 0,
                "unscheduled_defects": 0,
                "solver_objective_value": 0.0,
            }

        # Group defects by track
        defects_by_track: Dict[int, List[Dict[str, Any]]] = {}
        for defect in pending_defects:
            track_id = defect['trackid']
            if track_id is not None:
                defects_by_track.setdefault(track_id, []).append(defect)

        if not defects_by_track:
            return {
                "status": "NO_WORK",
                "success": True,
                "message": "No pending defects have an assigned Katpadi track.",
                "blocks_created": 0,
                "defects_scheduled": 0,
                "unscheduled_defects": len(pending_defects),
                "solver_objective_value": 0.0,
            }

        # ---------------------------------------------------------
        # 3. Fetch Katpadi Train Movements from Supabase via Pure Raw SQL
        # ---------------------------------------------------------
        cursor.execute("""
            SELECT MovementID, TrainID, TrackID, Entry_Time, Exit_Time
            FROM Train_Movements;
        """)
        raw_movements = cursor.fetchall()

        raw_intervals_by_track: Dict[int, List[Dict[str, int]]] = {}

        for movement in raw_movements:
            t_id = movement['trackid']
            raw_intervals_by_track.setdefault(t_id, [])

            entry = movement['entry_time']
            exit_ = movement['exit_time']

            # Direct movement within horizon
            if entry < horizon_end and exit_ > now:
                s_min = max(0, int((entry - now).total_seconds() // 60))
                e_min = min(HORIZON_MINUTES, int((exit_ - now).total_seconds() // 60))
                if e_min > s_min:
                    raw_intervals_by_track[t_id].append({"start": s_min, "end": e_min, "duration": e_min - s_min})

            # Daily timetable projection across Katpadi corridors
            entry_tod = entry.hour * 60 + entry.minute
            exit_tod = exit_.hour * 60 + exit_.minute
            if exit_tod <= entry_tod:
                exit_tod += 1440
            dur = exit_tod - entry_tod

            today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
            for day in range(7):
                day_entry_dt = today_midnight + timedelta(days=day, minutes=entry_tod)
                day_exit_dt = day_entry_dt + timedelta(minutes=dur)

                s_offset = int((day_entry_dt - now).total_seconds() // 60)
                e_offset = int((day_exit_dt - now).total_seconds() // 60)

                # Clamp to horizon [0, 10080]
                clamped_start = max(0, s_offset)
                clamped_end = min(HORIZON_MINUTES, e_offset)

                if clamped_end > clamped_start:
                    raw_intervals_by_track[t_id].append({
                        "start": clamped_start,
                        "end": clamped_end,
                        "duration": clamped_end - clamped_start
                    })

        # Disjoint train intervals per track
        movements_by_track: Dict[int, List[Dict[str, int]]] = {}
        for t_id, intervals in raw_intervals_by_track.items():
            movements_by_track[t_id] = merge_intervals(intervals)

        # ---------------------------------------------------------
        # 4. Google OR-Tools CP-SAT Optimization Model Setup
        # ---------------------------------------------------------
        model = cp_model.CpModel()
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = SOLVER_TIME_LIMIT_SECONDS
        solver.parameters.num_search_workers = 4

        defect_schedule_info = {}
        objective_terms = []

        # Process each track with pending defects
        for track_id, track_defects in defects_by_track.items():
            track_intervals = []

            # 1. Add fixed train intervals on this track
            for idx, movement in enumerate(movements_by_track.get(track_id, [])):
                train_int = model.NewIntervalVar(
                    movement["start"],
                    movement["duration"],
                    movement["end"],
                    f"train_{track_id}_{idx}"
                )
                track_intervals.append(train_int)

            # 2. Add maintenance block for each defect on this track
            for defect in track_defects:
                d_id = defect['defectid']
                requested_time = int(defect['estimated_mins'] or 60)
                is_emergency = bool(defect['is_emergency'])

                # DYNAMIC DURATION LOGIC (Core Specification):
                # - If requested time < 180 minutes: exactly 180 minutes (3-hour safety minimum)
                # - If requested time >= 180 minutes: exactly equals the requested time
                if requested_time < MIN_SAFETY_DURATION:
                    block_duration = MIN_SAFETY_DURATION
                else:
                    block_duration = requested_time

                # Check if block can fit in 7-day horizon
                if block_duration > HORIZON_MINUTES:
                    return {
                        "status": "INFEASIBLE",
                        "success": False,
                        "message": INFEASIBLE_MESSAGE,
                        "blocks_created": 0,
                        "defects_scheduled": 0,
                        "unscheduled_defects": len(pending_defects),
                    }

                # Decision variables
                start_var = model.NewIntVar(0, HORIZON_MINUTES - block_duration, f"start_defect_{d_id}")
                end_var = model.NewIntVar(block_duration, HORIZON_MINUTES, f"end_defect_{d_id}")
                block_interval = model.NewIntervalVar(
                    start_var,
                    block_duration,
                    end_var,
                    f"interval_defect_{d_id}"
                )
                track_intervals.append(block_interval)

                defect_schedule_info[d_id] = {
                    "defect": defect,
                    "track_id": track_id,
                    "duration": block_duration,
                    "start_var": start_var,
                    "end_var": end_var,
                    "is_emergency": is_emergency,
                }

                # EMERGENCY TARGETING (24-Hour Rule):
                # Attempt to schedule within the first 24 hours (1,440 minutes).
                # If mathematically impossible, fall back to the next immediate possible gap.
                if is_emergency:
                    after_24h = model.NewBoolVar(f"after_24h_defect_{d_id}")
                    # after_24h is 1 if and only if start_var >= 1440
                    model.Add(start_var >= TWENTY_FOUR_HOURS).OnlyEnforceIf(after_24h)
                    model.Add(start_var < TWENTY_FOUR_HOURS).OnlyEnforceIf(after_24h.Not())

                    # Massive penalty for violating 24 hours (forces 24h gap if one exists)
                    objective_terms.append(1_000_000 * after_24h)
                    # Priority linear penalty pushing to earliest available minute
                    objective_terms.append(100 * start_var)
                else:
                    # Non-emergency: gentle linear penalty to schedule efficiently
                    objective_terms.append(1 * start_var)

            # Enforce NO OVERLAP between all train movements and maintenance blocks on this track
            model.AddNoOverlap(track_intervals)

        # Minimize penalties (forces emergencies < 24h if feasible, else next immediate gap)
        model.Minimize(sum(objective_terms))

        # ---------------------------------------------------------
        # 5. Solve CP-SAT Optimization Model
        # ---------------------------------------------------------
        solver_status = solver.Solve(model)

        # INFEASIBLE FALLBACK MESSAGE (Core Specification)
        if solver_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return {
                "status": "INFEASIBLE",
                "success": False,
                "message": INFEASIBLE_MESSAGE,
                "blocks_created": 0,
                "defects_scheduled": 0,
                "unscheduled_defects": len(pending_defects),
                "solver_objective_value": 0.0,
            }

        # ---------------------------------------------------------
        # 6. Database Persistence: Write Blocks and Tasks directly to Supabase
        # ---------------------------------------------------------
        created_blocks = 0
        scheduled_defect_ids = []

        for d_id, info in defect_schedule_info.items():
            start_mins = solver.Value(info["start_var"])
            end_mins = solver.Value(info["end_var"])

            block_start = now + timedelta(minutes=start_mins)
            block_end = now + timedelta(minutes=end_mins)

            # Insert Maintenance_Blocks into Supabase
            cursor.execute("""
                INSERT INTO Maintenance_Blocks (TrackID, Start_Time, End_Time, Block_Status)
                VALUES (%s, %s, %s, 'Algorithm_Proposed')
                RETURNING BlockID;
            """, (info["track_id"], block_start, block_end))
            new_block_id = cursor.fetchone()['blockid']
            created_blocks += 1

            # Insert Block_Tasks into Supabase
            cursor.execute("""
                INSERT INTO Block_Tasks (BlockID, DefectID) 
                VALUES (%s, %s);
            """, (new_block_id, d_id))

            # Update Defects status in Supabase to 'Scheduled'
            cursor.execute("""
                UPDATE Defects 
                SET Status = 'Scheduled' 
                WHERE DefectID = %s;
            """, (d_id,))
            scheduled_defect_ids.append(d_id)

        # Commit all changes to Supabase PostgreSQL cloud database
        conn.commit()

        total_scheduled = len(scheduled_defect_ids)
        return {
            "status": "OPTIMAL" if solver_status == cp_model.OPTIMAL else "FEASIBLE",
            "success": True,
            "message": f"Successfully created {created_blocks} Algorithm-Proposed block(s) and scheduled {total_scheduled} defect(s) for Katpadi Station Region.",
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