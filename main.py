from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from database import get_db_connection

# Import Badrinathan's CP-SAT algorithm function from scheduler.py
from scheduler import run_cp_sat_scheduler

class DefectCreate(BaseModel):
    assetid: int
    reportedby_empid: str
    estimated_mins: int = Field(default=60, ge=15, le=1440)
    severity_score: int = Field(..., ge=1, le=100)
    is_emergency: bool = False

app = FastAPI(title="TrackSafe - Full Stack Integrated Edition")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Online", "system": "TrackSafe Server & CP-SAT Engine Integrated"}

@app.get("/api/defects")
def get_all_defects():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        query = """
            SELECT d.DefectID, a.Asset_Type, e.Name AS Reported_By, dept.Dept_Name,
                   t.Track_Name, d.Estimated_Mins, d.Severity_Score, d.Is_Emergency, d.Status
            FROM Defects d
            JOIN Assets a ON d.AssetID = a.AssetID
            JOIN Employees e ON d.ReportedBy_EmpID = e.EmpID
            JOIN Departments dept ON e.DeptID = dept.DeptID
            JOIN Tracks t ON a.TrackID = t.TrackID;
        """
        cursor.execute(query)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@app.post("/api/defects", status_code=status.HTTP_201_CREATED)
def create_defect(defect: DefectCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DeptID FROM Employees WHERE EmpID = %s;", (defect.reportedby_empid,))
        emp = cursor.fetchone()
        cursor.execute("SELECT DeptID FROM Assets WHERE AssetID = %s;", (defect.assetid,))
        asset = cursor.fetchone()

        if not emp or not asset:
            raise HTTPException(status_code=404, detail="Employee or Asset not found")
        if emp['deptid'] != asset['deptid']:
            raise HTTPException(status_code=400, detail="Security Error: Department mismatch!")

        insert_query = """
            INSERT INTO Defects (AssetID, ReportedBy_EmpID, Estimated_Mins, Severity_Score, Is_Emergency, Status)
            VALUES (%s, %s, %s, %s, %s, 'Pending')
            RETURNING DefectID;
        """
        cursor.execute(insert_query, (
            defect.assetid, defect.reportedby_empid, 
            defect.estimated_mins, defect.severity_score, defect.is_emergency
        ))
        new_id = cursor.fetchone()['defectid']
        conn.commit()
        return {"message": "Defect added!", "defectid": new_id}
    finally:
        cursor.close()
        conn.close()

# ========================================================
# TRIGGER BADRINATHAN'S 7-DAY CP-SAT SCHEDULER ENGINE
# ========================================================
@app.post("/api/generate-schedule")
def trigger_scheduling_engine():
    """
    Executes Badrinathan's Google OR-Tools CP-SAT scheduler 
    across the 7-day horizon, enforcing the 3-hour minimum rule.
    """
    conn = get_db_connection()
    try:
        result = run_cp_sat_scheduler(conn)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()