-- ==============================================================================
-- TRACKSAFE: AI-POWERED RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM
-- Master BCNF Relational Schema & Katpadi Station Seed Data Script
-- PostgreSQL / Supabase Compatible (Pure Raw SQL)
-- ==============================================================================

-- ==============================================================================
-- SECTION 1: TABLE DEFINITIONS (DDL) - 11 Normalized Tables in BCNF
-- ==============================================================================

-- 1. Stations Table
CREATE TABLE IF NOT EXISTS stations (
    stationid SERIAL PRIMARY KEY,
    station_code VARCHAR(10) NOT NULL UNIQUE,
    station_name VARCHAR(100) NOT NULL,
    zone VARCHAR(50) DEFAULT 'Southern Railway'
);

-- 2. Sections Table (Railway corridors connecting adjacent stations)
CREATE TABLE IF NOT EXISTS sections (
    sectionid SERIAL PRIMARY KEY,
    start_stationid INTEGER NOT NULL REFERENCES stations(stationid) ON DELETE CASCADE,
    end_stationid INTEGER NOT NULL REFERENCES stations(stationid) ON DELETE CASCADE,
    distance_km NUMERIC(6, 2) NOT NULL
);

-- 3. Tracks Table (Physical track lines along sections)
CREATE TABLE IF NOT EXISTS tracks (
    trackid SERIAL PRIMARY KEY,
    sectionid INTEGER NOT NULL REFERENCES sections(sectionid) ON DELETE CASCADE,
    track_name VARCHAR(100) NOT NULL
);

-- 4. Departments Table
CREATE TABLE IF NOT EXISTS departments (
    deptid SERIAL PRIMARY KEY,
    dept_name VARCHAR(100) NOT NULL UNIQUE
);

-- 5. Employees Table (Authentication & role-based credentials)
CREATE TABLE IF NOT EXISTS employees (
    empid VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    deptid INTEGER REFERENCES departments(deptid) ON DELETE SET NULL,
    role VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255) NOT NULL
);

-- 6. Assets Table (Signals, rail joints, OHE masts assigned to tracks & departments)
CREATE TABLE IF NOT EXISTS assets (
    assetid SERIAL PRIMARY KEY,
    trackid INTEGER NOT NULL REFERENCES tracks(trackid) ON DELETE CASCADE,
    deptid INTEGER NOT NULL REFERENCES departments(deptid) ON DELETE CASCADE,
    asset_type VARCHAR(150) NOT NULL
);

-- 7. Trains Table
CREATE TABLE IF NOT EXISTS trains (
    trainid SERIAL PRIMARY KEY,
    train_number VARCHAR(20) NOT NULL UNIQUE,
    train_type VARCHAR(100) NOT NULL
);

-- 8. Train Movements Table (Scheduled timetable corridor occupancy)
CREATE TABLE IF NOT EXISTS train_movements (
    movementid SERIAL PRIMARY KEY,
    trainid INTEGER NOT NULL REFERENCES trains(trainid) ON DELETE CASCADE,
    trackid INTEGER NOT NULL REFERENCES tracks(trackid) ON DELETE CASCADE,
    entry_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    exit_time TIMESTAMP WITHOUT TIME ZONE NOT NULL
);

-- 9. Defects Table (Submitted maintenance requests)
CREATE TABLE IF NOT EXISTS defects (
    defectid SERIAL PRIMARY KEY,
    assetid INTEGER NOT NULL REFERENCES assets(assetid) ON DELETE CASCADE,
    reportedby_empid VARCHAR(50) NOT NULL REFERENCES employees(empid) ON DELETE CASCADE,
    estimated_mins INTEGER NOT NULL DEFAULT 60,
    severity_score INTEGER NOT NULL DEFAULT 30,
    is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending'
);

-- 10. Maintenance Blocks Table (Scheduled possession windows)
CREATE TABLE IF NOT EXISTS maintenance_blocks (
    blockid SERIAL PRIMARY KEY,
    trackid INTEGER NOT NULL REFERENCES tracks(trackid) ON DELETE CASCADE,
    start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    end_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    block_status VARCHAR(50) NOT NULL DEFAULT 'Algorithm_Proposed'
);

-- 11. Block Tasks Table (Associative table linking defects to maintenance blocks)
CREATE TABLE IF NOT EXISTS block_tasks (
    blockid INTEGER NOT NULL REFERENCES maintenance_blocks(blockid) ON DELETE CASCADE,
    defectid INTEGER NOT NULL REFERENCES defects(defectid) ON DELETE CASCADE,
    PRIMARY KEY (blockid, defectid)
);


-- ==============================================================================
-- SECTION 2: DATA INSERTIONS (DML) - Katpadi Region Seed Dataset
-- ==============================================================================

-- 1. Insert Stations (Katpadi Junction and adjoining junctions)
INSERT INTO stations (stationid, station_code, station_name, zone) VALUES
(1, 'KPD', 'Katpadi Junction', 'Southern Railway'),
(2, 'AJJ', 'Arakkonam Junction', 'Southern Railway'),
(3, 'JTJ', 'Jolarpettai Junction', 'Southern Railway'),
(4, 'VLR', 'Vellore Cantonment', 'Southern Railway')
ON CONFLICT (stationid) DO NOTHING;

-- 2. Insert Sections
INSERT INTO sections (sectionid, start_stationid, end_stationid, distance_km) VALUES
(1, 2, 1, 61.50), -- Arakkonam - Katpadi Section
(2, 1, 3, 84.00), -- Katpadi - Jolarpettai Section
(3, 1, 4, 10.20)  -- Katpadi - Vellore Section
ON CONFLICT (sectionid) DO NOTHING;

-- 3. Insert Tracks
INSERT INTO tracks (trackid, sectionid, track_name) VALUES
(1, 1, 'UP Main Line (AJJ - KPD)'),
(2, 1, 'DOWN Main Line (KPD - AJJ)'),
(3, 2, 'UP Main Line (KPD - JTJ)'),
(4, 2, 'DOWN Main Line (JTJ - KPD)'),
(5, 3, 'Branch Line (KPD - VLR)'),
(6, 1, 'Katpadi Goods Loop Line')
ON CONFLICT (trackid) DO NOTHING;

-- 4. Insert Departments
INSERT INTO departments (deptid, dept_name) VALUES
(1, 'Track Engineering'),
(2, 'Signal & Telecom'),
(3, 'Electrical (OHE)')
ON CONFLICT (deptid) DO NOTHING;

-- 5. Insert Employees with Credentials for Katpadi Region
INSERT INTO employees (empid, name, deptid, role, email, password) VALUES
('SM-KPD-01', 'S. Ramanathan', 1, 'Station Master', 'master@katpadi.in', 'password'),
('ENG-TRK-01', 'Arish I.', 1, 'Senior Section Engineer (Track)', 'track@katpadi.in', 'password'),
('ENG-SIG-01', 'Badrinathan S.G.', 2, 'Signal Inspector', 'signal@katpadi.in', 'password'),
('ENG-ELE-01', 'Ravi Kumar', 3, 'Traction Loco Controller', 'electrical@katpadi.in', 'password')
ON CONFLICT (empid) DO UPDATE SET
    email = EXCLUDED.email,
    password = EXCLUDED.password;

-- 6. Insert Assets (Linked to Katpadi tracks & departments)
INSERT INTO assets (assetid, trackid, deptid, asset_type) VALUES
(1, 1, 1, 'Continuous Welded Rail Joint (AJJ-KPD KM 118)'),
(2, 6, 1, 'Diamond Crossing Points 14A (Katpadi Yard)'),
(3, 1, 2, 'Color Light Home Signal S-12 (Katpadi East)'),
(4, 3, 2, 'Axle Counter Sensor Block DP-4 (KPD-JTJ)'),
(5, 1, 3, '25kV OHE Cantilever Mast KM 124 (Katpadi Approach)'),
(6, 3, 3, 'Traction Feeder Circuit Breaker CB-2 (Katpadi Substation)')
ON CONFLICT (assetid) DO NOTHING;

-- 7. Insert Trains operating through Katpadi
INSERT INTO trains (trainid, train_number, train_type) VALUES
(1, '12675', 'Kovai Superfast Express'),
(2, '12639', 'Brindavan Express'),
(3, '20607', 'Vande Bharat Express (MAS-MYS)'),
(4, '12007', 'Shatabdi Express (MAS-MYS)'),
(5, 'BOXN-88', 'Freight Coal Rake')
ON CONFLICT (trainid) DO NOTHING;

-- 8. Insert Train Movements (Active corridor occupancy timetable)
INSERT INTO train_movements (movementid, trainid, trackid, entry_time, exit_time) VALUES
(1, 1, 1, NOW() + INTERVAL '3 hours 15 minutes', NOW() + INTERVAL '4 hours'),
(2, 2, 2, NOW() + INTERVAL '5 hours 30 minutes', NOW() + INTERVAL '6 hours 15 minutes'),
(3, 3, 3, NOW() + INTERVAL '7 hours 45 minutes', NOW() + INTERVAL '8 hours 20 minutes'),
(4, 4, 4, NOW() + INTERVAL '10 hours', NOW() + INTERVAL '10 hours 40 minutes'),
(5, 5, 6, NOW() + INTERVAL '12 hours 30 minutes', NOW() + INTERVAL '13 hours 45 minutes')
ON CONFLICT (movementid) DO NOTHING;

-- 9. Insert Initial Pending Defects
INSERT INTO defects (defectid, assetid, reportedby_empid, estimated_mins, severity_score, is_emergency, status) VALUES
(1, 1, 'ENG-TRK-01', 90, 85, FALSE, 'Pending'),
(2, 3, 'ENG-SIG-01', 60, 100, TRUE, 'Pending'),
(3, 5, 'ENG-ELE-01', 120, 60, FALSE, 'Pending')
ON CONFLICT (defectid) DO NOTHING;
