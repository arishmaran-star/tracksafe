"""
TRACKSAFE: RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM (KATPADI REGION)
FastAPI Server (Strict Pure Raw SQL Edition)
STRICT CONSTRAINT: Pure raw SQL with psycopg2 and RealDictCursor only.
No SQLAlchemy, No ORM models, No SessionMaker.
"""

from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from database import get_db_connection
from scheduler import run_cp_sat_scheduler

app = FastAPI(
    title="TrackSafe - Katpadi Railway Operations API",
    description="Katpadi Station Region Block Orchestration Engine using Google OR-Tools CP-SAT (Pure Raw SQL)",
    version="3.1.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------------------------------------------------------
# PYDANTIC SCHEMAS FOR REQUEST VALIDATION
# -------------------------------------------------------------

class MasterLoginRequest(BaseModel):
    email: str = Field(..., description="Email or Employee ID of Station Master (e.g. master@katpadi.in)")
    password: str = Field(..., description="Password")


class EngineerLoginRequest(BaseModel):
    dept_id: int = Field(..., description="Chosen Department ID (e.g. 1=Track, 2=Signal, 3=Electrical)")
    email: str = Field(..., description="Email or Employee ID of Engineer (e.g. track@katpadi.in)")
    password: str = Field(..., description="Password")


class DefectCreate(BaseModel):
    assetid: int = Field(..., description="Target Katpadi Asset ID")
    reportedby_empid: Optional[str] = Field(None, description="Employee ID reporting defect (e.g. ENG-TRK-01)")
    empid: Optional[str] = Field(None, description="Alternative Employee ID")
    estimated_mins: Optional[int] = Field(None, description="Required time in minutes")
    required_time: Optional[int] = Field(None, description="Alternative field for required time")
    severity_score: Optional[int] = Field(None, ge=1, le=100, description="Severity score (30, 60, 100)")
    issue_type: Optional[str] = Field(None, description="Routine, Repair, or Emergency")
    is_emergency: Optional[bool] = Field(False, description="Emergency flag")


class BlockApproveRequest(BaseModel):
    blockid: int = Field(..., description="Maintenance Block ID")
    new_start_time: str = Field(..., description="Approved start time (ISO string)")
    new_end_time: str = Field(..., description="Approved end time (ISO string)")


# -------------------------------------------------------------
# AUTHENTICATION & LOGIN ENDPOINTS (PURE RAW SQL)
# -------------------------------------------------------------

@app.get("/")
def read_root():
    return {
        "status": "Online",
        "region": "Katpadi Station Region",
        "system": "TrackSafe Scheduling Engine",
        "architecture": "Pure Raw SQL (psycopg2 + RealDictCursor) & Google CP-SAT"
    }


@app.post("/api/login/master")
def login_station_master(payload: MasterLoginRequest):
    """
    Validates Station Master credentials for Katpadi Station.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT empid, name, deptid, role, email, password
            FROM employees
            WHERE (LOWER(email) = LOWER(%s) OR empid = %s)
              AND role = 'Station Master';
        """
        cursor.execute(query, (payload.email.strip(), payload.email.strip()))
        user = cursor.fetchone()

        if not user or user["password"] != payload.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Please enter valid Station Master credentials for Katpadi."
            )

        return {
            "success": True,
            "message": "Authenticated as Katpadi Station Master",
            "user": {
                "empid": user["empid"],
                "name": user["name"],
                "role": user["role"],
                "email": user["email"],
                "region": "Katpadi Station"
            }
        }
    finally:
        cursor.close()
        conn.close()


@app.post("/api/login/engineer")
def login_engineer(payload: EngineerLoginRequest):
    """
    Validates engineer credentials and explicitly requires the chosen Department to match.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT deptid, dept_name FROM departments WHERE deptid = %s;", (payload.dept_id,))
        chosen_dept = cursor.fetchone()
        if not chosen_dept:
            raise HTTPException(status_code=400, detail="Invalid department selected.")

        query = """
            SELECT e.empid, e.name, e.deptid, d.dept_name, e.role, e.email, e.password
            FROM employees e
            JOIN departments d ON e.deptid = d.deptid
            WHERE (LOWER(e.email) = LOWER(%s) OR e.empid = %s);
        """
        cursor.execute(query, (payload.email.strip(), payload.email.strip()))
        user = cursor.fetchone()

        if not user or user["password"] != payload.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials. Please verify your Email/ID and Password."
            )

        if user["deptid"] != payload.dept_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Department Authorization Mismatch: You selected '{chosen_dept['dept_name']}', "
                    f"but your credentials belong to '{user['dept_name']}'. "
                    f"Please select '{user['dept_name']}' in the department selector to log in."
                )
            )

        return {
            "success": True,
            "message": f"Authenticated as Engineer for {user['dept_name']}",
            "user": {
                "empid": user["empid"],
                "name": user["name"],
                "dept_id": user["deptid"],
                "dept_name": user["dept_name"],
                "role": user["role"],
                "email": user["email"],
                "region": "Katpadi Station"
            }
        }
    finally:
        cursor.close()
        conn.close()


# -------------------------------------------------------------
# KATPADI REGION METADATA ENDPOINTS
# -------------------------------------------------------------

@app.get("/api/departments")
def get_departments():
    """
    Returns departments in Katpadi Station Region.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT deptid, dept_name FROM departments ORDER BY deptid ASC;")
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


@app.get("/api/assets")
def get_assets(dept_id: Optional[int] = None):
    """
    Returns assets in Katpadi region, optionally filtered by department.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT a.assetid, a.trackid, tk.track_name, a.deptid, d.dept_name, a.asset_type
            FROM assets a
            JOIN tracks tk ON a.trackid = tk.trackid
            JOIN departments d ON a.deptid = d.deptid
            WHERE (%s IS NULL OR a.deptid = %s)
            ORDER BY a.assetid ASC;
        """
        cursor.execute(query, (dept_id, dept_id))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


@app.get("/api/train-movements")
def get_train_movements():
    """
    Returns train schedules specifically for the Katpadi region.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT 
                tm.movementid,
                tm.trainid,
                t.train_number,
                t.train_type AS train_name,
                tm.trackid,
                tk.track_name,
                tm.entry_time,
                tm.exit_time,
                'Katpadi Station Region' AS region
            FROM train_movements tm
            JOIN trains t ON tm.trainid = t.trainid
            JOIN tracks tk ON tm.trackid = tk.trackid
            ORDER BY tm.entry_time ASC;
        """
        cursor.execute(query)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


# -------------------------------------------------------------
# DEFECTS & ADVANCED BLOCK AGGREGATION (PURE RAW SQL)
# -------------------------------------------------------------

@app.get("/api/defects")
def get_all_defects():
    """
    Returns human-readable defect details via 5-table JOIN in Katpadi region.
    Includes DeptID and Dept_Name so frontend can filter 'My Department' vs 'Other Departments'.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT 
                d.DefectID,
                d.AssetID,
                a.Asset_Type,
                a.DeptID,
                dept.Dept_Name,
                d.ReportedBy_EmpID,
                e.Name AS Reported_By,
                t.TrackID,
                t.Track_Name,
                'Katpadi Station' AS Region,
                d.Estimated_Mins,
                d.Severity_Score,
                d.Is_Emergency,
                d.Status,
                CASE 
                    WHEN d.Is_Emergency = TRUE THEN 'Emergency'
                    WHEN d.Severity_Score >= 60 THEN 'Repair'
                    ELSE 'Routine'
                END AS Issue_Type
            FROM Defects d
            JOIN Assets a ON d.AssetID = a.AssetID
            JOIN Employees e ON d.ReportedBy_EmpID = e.EmpID
            JOIN Departments dept ON a.DeptID = dept.DeptID
            JOIN Tracks t ON a.TrackID = t.TrackID
            ORDER BY d.Is_Emergency DESC, d.DefectID DESC;
        """
        cursor.execute(query)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


@app.post("/api/defects", status_code=status.HTTP_201_CREATED)
def create_defect(defect: DefectCreate):
    """
    Validates that Employee.DeptID matches Asset.DeptID before inserting.
    Blocks mismatch with HTTP 400 Bad Request.
    """
    emp_id = defect.reportedby_empid or defect.empid
    if not emp_id:
        raise HTTPException(status_code=400, detail="Employee ID is required.")

    mins = defect.estimated_mins or defect.required_time or 60
    severity = defect.severity_score
    if severity is None:
        if defect.issue_type:
            it = defect.issue_type.lower()
            if it == 'emergency':
                severity = 100
            elif it == 'repair':
                severity = 60
            else:
                severity = 30
        else:
            severity = 100 if defect.is_emergency else 30

    is_emergency = defect.is_emergency or (severity >= 100) or ((defect.issue_type or '').lower() == 'emergency')

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT deptid, name FROM employees WHERE empid = %s;", (emp_id,))
        emp = cursor.fetchone()

        cursor.execute("SELECT deptid, asset_type FROM assets WHERE assetid = %s;", (defect.assetid,))
        asset = cursor.fetchone()

        if not emp:
            raise HTTPException(status_code=404, detail=f"Employee '{emp_id}' not found in Katpadi region.")
        if not asset:
            raise HTTPException(status_code=404, detail=f"Asset ID {defect.assetid} not found in Katpadi region.")

        if emp['deptid'] != asset['deptid']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Department Mismatch: Employee '{emp['name']}' (Dept {emp['deptid']}) "
                    f"is not authorized to report defects for Asset '{asset['asset_type']}' (Dept {asset['deptid']}). "
                    "Engineers may only request maintenance on assets within their assigned department."
                )
            )

        insert_query = """
            INSERT INTO Defects (AssetID, ReportedBy_EmpID, Estimated_Mins, Severity_Score, Is_Emergency, Status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
            RETURNING DefectID;
        """
        cursor.execute(insert_query, (
            defect.assetid,
            emp_id,
            mins,
            severity,
            is_emergency
        ))
        new_defect_id = cursor.fetchone()['defectid']
        conn.commit()

        return {
            "message": "Defect logged successfully with status 'Pending'.",
            "defectid": new_defect_id
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()


@app.post("/api/generate-schedule")
def generate_schedule():
    """
    Executes the CP-SAT scheduling algorithm for Katpadi region.
    """
    conn = get_db_connection()
    try:
        result = run_cp_sat_scheduler(conn)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scheduling Algorithm Exception: {str(e)}")
    finally:
        conn.close()


@app.get("/api/blocks")
def get_blocks(status: Optional[str] = None):
    """
    Advanced SQL JOIN & Aggregation:
    Bundles all Department names, DeptIDs, and highest Severity associated with each BlockID.
    Calculates is_collaborative where COUNT(DISTINCT dept.DeptID) > 1.
    Allows filtering by status (?status=Algorithm_Proposed or ?status=Approved or all).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        filter_status = None if (not status or status.lower() == 'all') else status

        query = """
            SELECT 
                b.BlockID,
                b.TrackID,
                t.Track_Name,
                b.Start_Time,
                b.End_Time,
                b.Block_Status,
                CAST(ROUND(EXTRACT(EPOCH FROM (b.End_Time - b.Start_Time)) / 60) AS INTEGER) AS duration_minutes,
                COALESCE(STRING_AGG(DISTINCT dept.Dept_Name, ', '), 'General Maintenance') AS departments,
                COALESCE(ARRAY_AGG(DISTINCT dept.DeptID) FILTER (WHERE dept.DeptID IS NOT NULL), '{}') AS dept_ids,
                COUNT(DISTINCT dept.DeptID) AS dept_count,
                (COUNT(DISTINCT dept.DeptID) > 1) AS is_collaborative,
                MAX(d.Severity_Score) AS max_severity,
                BOOL_OR(COALESCE(d.Is_Emergency, FALSE)) AS has_emergency,
                CASE 
                    WHEN BOOL_OR(COALESCE(d.Is_Emergency, FALSE)) THEN 'Emergency'
                    WHEN MAX(d.Severity_Score) >= 60 THEN 'Repair'
                    ELSE 'Routine'
                END AS highest_severity_text,
                COUNT(DISTINCT d.DefectID) AS defect_count
            FROM Maintenance_Blocks b
            JOIN Tracks t ON b.TrackID = t.TrackID
            LEFT JOIN Block_Tasks bt ON b.BlockID = bt.BlockID
            LEFT JOIN Defects d ON bt.DefectID = d.DefectID
            LEFT JOIN Assets a ON d.AssetID = a.AssetID
            LEFT JOIN Departments dept ON a.DeptID = dept.DeptID
            WHERE (%s IS NULL OR b.Block_Status = %s)
            GROUP BY b.BlockID, b.TrackID, t.Track_Name, b.Start_Time, b.End_Time, b.Block_Status
            ORDER BY b.Start_Time ASC;
        """
        cursor.execute(query, (filter_status, filter_status))
        blocks = cursor.fetchall()
        return blocks
    finally:
        cursor.close()
        conn.close()


@app.put("/api/blocks/approve")
def approve_block(payload: BlockApproveRequest):
    """
    Accepts JSON payload { blockid, new_start_time, new_end_time }.
    Updates block times (allowing manual overrides from Station Master)
    and sets Block_Status = 'Approved'.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT BlockID, Block_Status FROM Maintenance_Blocks WHERE BlockID = %s;",
            (payload.blockid,)
        )
        block = cursor.fetchone()
        if not block:
            raise HTTPException(status_code=404, detail=f"Maintenance Block #{payload.blockid} not found.")

        update_query = """
            UPDATE Maintenance_Blocks
            SET Start_Time = %s, End_Time = %s, Block_Status = 'Approved'
            WHERE BlockID = %s
            RETURNING BlockID, TrackID, Start_Time, End_Time, Block_Status;
        """
        cursor.execute(update_query, (
            payload.new_start_time,
            payload.new_end_time,
            payload.blockid
        ))
        updated_block = cursor.fetchone()

        # Update associated defects to 'Approved'
        cursor.execute("""
            UPDATE Defects
            SET Status = 'Approved'
            WHERE DefectID IN (
                SELECT DefectID FROM Block_Tasks WHERE BlockID = %s
            );
        """, (payload.blockid,))

        conn.commit()
        return {
            "message": f"Block #{payload.blockid} successfully approved and locked into Katpadi schedule.",
            "block": updated_block
        }

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cursor.close()
        conn.close()
