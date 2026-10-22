import database
from datetime import datetime, timedelta

conn = database.get_db_connection()
cur = conn.cursor()

try:
    print("Beginning Katpadi Station Region database migration...")

    # 1. Ensure employees has email and password columns
    cur.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);")
    cur.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS password VARCHAR(255);")

    # 2. Clear out older records
    cur.execute("DELETE FROM block_tasks;")
    cur.execute("DELETE FROM maintenance_blocks;")
    cur.execute("DELETE FROM defects;")
    cur.execute("DELETE FROM train_movements;")
    cur.execute("DELETE FROM trains;")
    cur.execute("DELETE FROM assets;")
    cur.execute("DELETE FROM tracks;")
    cur.execute("DELETE FROM sections;")
    cur.execute("DELETE FROM stations;")
    cur.execute("DELETE FROM employees;")
    cur.execute("DELETE FROM departments;")

    # 3. Seed Stations (Katpadi Region)
    cur.execute("""
        INSERT INTO stations (stationid, station_code, station_name, zone) VALUES
        (1, 'KPD', 'Katpadi Junction', 'Southern Railway'),
        (2, 'AJJ', 'Arakkonam Junction', 'Southern Railway'),
        (3, 'JTJ', 'Jolarpettai Junction', 'Southern Railway'),
        (4, 'VLR', 'Vellore Cantonment', 'Southern Railway');
    """)

    # 4. Seed Sections (strictly surrounding Katpadi)
    cur.execute("""
        INSERT INTO sections (sectionid, start_stationid, end_stationid, distance_km) VALUES
        (1, 2, 1, 61.50), -- AJJ - KPD
        (2, 1, 3, 84.00), -- KPD - JTJ
        (3, 1, 4, 10.20); -- KPD - VLR
    """)

    # 5. Seed Tracks (Katpadi station tracks and adjoining main lines)
    cur.execute("""
        INSERT INTO tracks (trackid, sectionid, track_name) VALUES
        (1, 1, 'UP Main Line (AJJ - KPD)'),
        (2, 1, 'DOWN Main Line (KPD - AJJ)'),
        (3, 2, 'UP Main Line (KPD - JTJ)'),
        (4, 2, 'DOWN Main Line (JTJ - KPD)'),
        (5, 3, 'Branch Line (KPD - VLR)'),
        (6, 1, 'Katpadi Goods Loop Line');
    """)

    # 6. Seed Departments
    cur.execute("""
        INSERT INTO departments (deptid, dept_name) VALUES
        (1, 'Track Engineering'),
        (2, 'Signal & Telecom'),
        (3, 'Electrical (OHE)');
    """)

    # 7. Seed Employees with Unique Credentials for Katpadi
    cur.execute("""
        INSERT INTO employees (empid, name, deptid, role, email, password) VALUES
        ('SM-KPD-01', 'S. Ramanathan', 1, 'Station Master', 'master@katpadi.in', 'password'),
        ('ENG-TRK-01', 'Arish I.', 1, 'Senior Section Engineer (Track)', 'track@katpadi.in', 'password'),
        ('ENG-SIG-01', 'Badrinathan S.G.', 2, 'Signal Inspector', 'signal@katpadi.in', 'password'),
        ('ENG-ELE-01', 'Ravi Kumar', 3, 'Traction Loco Controller', 'electrical@katpadi.in', 'password');
    """)

    # 8. Seed Assets in Katpadi Region
    cur.execute("""
        INSERT INTO assets (assetid, trackid, deptid, asset_type) VALUES
        (1, 1, 1, 'Continuous Welded Rail Joint (AJJ-KPD KM 118)'),
        (2, 6, 1, 'Diamond Crossing Points 14A (Katpadi Yard)'),
        (3, 1, 2, 'Color Light Home Signal S-12 (Katpadi East)'),
        (4, 3, 2, 'Axle Counter Sensor Block DP-4 (KPD-JTJ)'),
        (5, 1, 3, '25kV OHE Cantilever Mast KM 124 (Katpadi Approach)'),
        (6, 3, 3, 'Traction Feeder Circuit Breaker CB-2 (Katpadi Substation)');
    """)

    # 9. Seed Trains passing through Katpadi
    cur.execute("""
        INSERT INTO trains (trainid, train_number, train_type) VALUES
        (1, '12675', 'Kovai Superfast Express'),
        (2, '12639', 'Brindavan Express'),
        (3, '20607', 'Vande Bharat Express (MAS-MYS)'),
        (4, '12007', 'Shatabdi Express (MAS-MYS)'),
        (5, 'BOXN-88', 'Freight Coal Rake');
    """)

    # 10. Seed Train Movements for Katpadi (active windows)
    now = datetime.now()
    today_base = now.replace(minute=0, second=0, microsecond=0)

    cur.execute("""
        INSERT INTO train_movements (movementid, trainid, trackid, entry_time, exit_time) VALUES
        (1, 1, 1, %s, %s),
        (2, 2, 2, %s, %s),
        (3, 3, 3, %s, %s),
        (4, 4, 4, %s, %s),
        (5, 5, 6, %s, %s);
    """, (
        today_base + timedelta(hours=6, minutes=15), today_base + timedelta(hours=7, minutes=0),
        today_base + timedelta(hours=8, minutes=30), today_base + timedelta(hours=9, minutes=15),
        today_base + timedelta(hours=10, minutes=45), today_base + timedelta(hours=11, minutes=20),
        today_base + timedelta(hours=13, minutes=0), today_base + timedelta(hours=13, minutes=40),
        today_base + timedelta(hours=15, minutes=30), today_base + timedelta(hours=16, minutes=45)
    ))

    # 11. Seed Initial Defects (Pending and Approved)
    cur.execute("""
        INSERT INTO defects (defectid, assetid, reportedby_empid, estimated_mins, severity_score, is_emergency, status) VALUES
        (1, 1, 'ENG-TRK-01', 90, 85, FALSE, 'Pending'),
        (2, 3, 'ENG-SIG-01', 60, 100, TRUE, 'Pending'),
        (3, 5, 'ENG-ELE-01', 120, 60, FALSE, 'Pending'),
        (4, 1, 'ENG-TRK-01', 180, 85, FALSE, 'Approved'),
        (5, 3, 'ENG-SIG-01', 180, 60, FALSE, 'Approved');
    """)

    # 12. Seed an Approved Multi-Department Collaborative Block (Shared between Track and Signal on Track 1)
    block_start = now + timedelta(hours=1)
    block_end = block_start + timedelta(hours=3) # 180 mins

    cur.execute("""
        INSERT INTO maintenance_blocks (blockid, trackid, start_time, end_time, block_status) VALUES
        (101, 1, %s, %s, 'Approved');
    """, (block_start, block_end))

    # Link both Defect 4 (Track Engineering) and Defect 5 (Signal & Telecom) to Block 101
    cur.execute("""
        INSERT INTO block_tasks (blockid, defectid) VALUES
        (101, 4),
        (101, 5);
    """)

    conn.commit()
    print("SUCCESS: Database fully re-seeded with Katpadi Region data and Collaborative Block sample!")

except Exception as e:
    conn.rollback()
    print("Migration Error:", e)
    raise e
finally:
    cur.close()
    conn.close()
