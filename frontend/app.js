/**
 * TRACKSAFE: RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM (KATPADI REGION)
 * Pure Vanilla JavaScript & Tailwind CSS Client
 * UI/UX Visualization & Dashboard Separation Engine
 */

const API_BASE = "http://localhost:8000/api";

// =========================================================
// 1. INITIALIZATION & SESSION MANAGEMENT
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  const role = sessionStorage.getItem("userRole");
  if (role) {
    renderCurrentSession();
  } else {
    logout();
  }
});

function showAlert(message, type = "info") {
  const alertBox = document.getElementById("alertBox");
  const alertContent = document.getElementById("alertContent");
  const alertMessage = document.getElementById("alertMessage");
  const alertIcon = document.getElementById("alertIcon");

  if (!alertBox) return;

  alertBox.classList.remove("hidden");
  alertMessage.textContent = message;

  if (type === "error") {
    alertIcon.textContent = "⚠️";
    alertContent.className = "p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm bg-rose-50 text-rose-800 border border-rose-200";
  } else if (type === "success") {
    alertIcon.textContent = "✅";
    alertContent.className = "p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm bg-emerald-50 text-emerald-800 border border-emerald-200";
  } else {
    alertIcon.textContent = "ℹ️";
    alertContent.className = "p-4 rounded-xl text-sm font-medium flex items-center justify-between shadow-sm bg-blue-50 text-blue-800 border border-blue-200";
  }
}

function dismissAlert() {
  const alertBox = document.getElementById("alertBox");
  if (alertBox) alertBox.classList.add("hidden");
}

function logout() {
  sessionStorage.clear();
  document.getElementById("userBar").classList.add("hidden");
  document.getElementById("engineerDashboard").classList.add("hidden");
  document.getElementById("controllerDashboard").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  dismissAlert();
}

function renderCurrentSession() {
  const role = sessionStorage.getItem("userRole");
  const empName = sessionStorage.getItem("empName") || "User";
  const empId = sessionStorage.getItem("empId") || "";
  const deptName = sessionStorage.getItem("deptName") || "";

  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("userBar").classList.remove("hidden");

  if (role === "master") {
    document.getElementById("headerUserLabel").textContent = `Station Master: ${empName}`;
    document.getElementById("masterNameLabel").textContent = empName;
    document.getElementById("controllerDashboard").classList.remove("hidden");
    document.getElementById("engineerDashboard").classList.add("hidden");
    refreshControllerData();
  } else if (role === "engineer") {
    document.getElementById("headerUserLabel").textContent = `${empName} (${deptName})`;
    document.getElementById("engineerDeptBadge").textContent = `Department: ${deptName}`;
    const myDeptBoxBadge = document.getElementById("myDeptBoxBadge");
    if (myDeptBoxBadge) myDeptBoxBadge.textContent = deptName;
    document.getElementById("engineerNameLabel").textContent = empName;
    document.getElementById("engineerIdLabel").textContent = empId;
    document.getElementById("engineerDashboard").classList.remove("hidden");
    document.getElementById("controllerDashboard").classList.add("hidden");

    handleIssueTypeChange();
    loadEngineerAssets();
    refreshEngineerData();
  }
}


// =========================================================
// 2. AUTHENTICATION (STATION MASTER & ENGINEER)
// =========================================================

async function handleMasterLogin(e) {
  e.preventDefault();
  dismissAlert();

  const email = document.getElementById("masterEmail").value.trim();
  const password = document.getElementById("masterPassword").value.trim();
  const btn = document.getElementById("masterLoginBtn");

  btn.disabled = true;
  btn.textContent = "Authenticating...";

  try {
    const res = await fetch(`${API_BASE}/login/master`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Authentication failed for Station Master.", "error");
    } else {
      sessionStorage.setItem("userRole", "master");
      sessionStorage.setItem("empId", data.user.empid);
      sessionStorage.setItem("empName", data.user.name);
      sessionStorage.setItem("region", "Katpadi Station");
      showAlert(`Welcome, ${data.user.name}. Authenticated for Katpadi Station Control.`, "success");
      renderCurrentSession();
    }
  } catch (err) {
    showAlert("Network Error: Ensure backend is running at http://localhost:8000", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login as Controller →";
  }
}

async function handleEngineerLogin(e) {
  e.preventDefault();
  dismissAlert();

  const deptId = parseInt(document.getElementById("loginDeptSelect").value);
  const email = document.getElementById("engineerEmail").value.trim();
  const password = document.getElementById("engineerPassword").value.trim();
  const btn = document.getElementById("engineerLoginBtn");

  btn.disabled = true;
  btn.textContent = "Verifying Department Authorization...";

  try {
    const res = await fetch(`${API_BASE}/login/engineer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dept_id: deptId, email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Department Authentication failed.", "error");
    } else {
      sessionStorage.setItem("userRole", "engineer");
      sessionStorage.setItem("empId", data.user.empid);
      sessionStorage.setItem("empName", data.user.name);
      sessionStorage.setItem("deptId", data.user.dept_id);
      sessionStorage.setItem("deptName", data.user.dept_name);
      sessionStorage.setItem("region", "Katpadi Station");
      showAlert(`Welcome, ${data.user.name}. Authorized for ${data.user.dept_name}.`, "success");
      renderCurrentSession();
    }
  } catch (err) {
    showAlert("Network Error: Ensure backend is running at http://localhost:8000", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login as Engineer →";
  }
}


// =========================================================
// 3. BADGE & FORMATTING HELPERS (SEVERITY TRANSLATION)
// =========================================================

/**
 * Translates severity numbers or raw strings to:
 * "Routine", "Repair", or "Emergency" with corresponding Tailwind badges.
 */
function getSeverityBadge(value, isEmergency = false) {
  let label = "Routine";

  if (isEmergency) {
    label = "Emergency";
  } else if (typeof value === "number") {
    if (value >= 100) label = "Emergency";
    else if (value >= 60) label = "Repair";
    else label = "Routine";
  } else if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("emergency") || lower.includes("critical")) {
      label = "Emergency";
    } else if (lower.includes("repair") || lower.includes("medium")) {
      label = "Repair";
    } else {
      label = "Routine";
    }
  }

  if (label === "Emergency") {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs">
      <span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
      🚨 Emergency
    </span>`;
  } else if (label === "Repair") {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
      🛠️ Repair
    </span>`;
  } else {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
      📋 Routine
    </span>`;
  }
}

/**
 * Returns color-coded badge for defect and block statuses.
 */
function getStatusBadge(status) {
  const s = (status || "").toLowerCase();
  if (s === "approved") {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Approved</span>`;
  } else if (s === "pending") {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Pending</span>`;
  } else if (s === "algorithm_proposed") {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">Algorithm Proposed</span>`;
  } else {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">${status || "Unknown"}</span>`;
  }
}

/**
 * Returns distinct badge styling per railway department.
 */
function getDepartmentBadge(deptName) {
  const d = (deptName || "").toLowerCase();
  if (d.includes("track")) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">Track</span>`;
  } else if (d.includes("signal")) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">Signal &amp; Telecom</span>`;
  } else if (d.includes("electrical") || d.includes("ohe")) {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Electrical (OHE)</span>`;
  } else {
    return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">${deptName || "General"}</span>`;
  }
}

function formatForDatetimeLocal(rawStr) {
  if (!rawStr) return "";
  const d = new Date(rawStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDisplayDateTime(rawStr) {
  if (!rawStr) return "N/A";
  const d = new Date(rawStr);
  if (isNaN(d.getTime())) return rawStr;
  const day = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day}, ${time}`;
}


// =========================================================
// 4. ENGINEER CONSOLE & DEFECT LOGGING
// =========================================================

async function refreshEngineerData() {
  await fetchDefects();
  await fetchEngineerApprovedBlocks();
}

/**
 * Loads assets belonging to the logged-in engineer's department in Katpadi
 */
async function loadEngineerAssets() {
  const deptId = sessionStorage.getItem("deptId");
  const assetSelect = document.getElementById("assetSelect");
  if (!assetSelect) return;

  try {
    const res = await fetch(`${API_BASE}/assets?dept_id=${deptId}`);
    if (!res.ok) throw new Error("Could not load assets");
    const assets = await res.json();

    if (assets.length === 0) {
      assetSelect.innerHTML = `<option value="">No assets registered for ${sessionStorage.getItem("deptName")}</option>`;
      return;
    }

    assetSelect.innerHTML = assets.map(a => `
      <option value="${a.assetid}">Asset #${a.assetid}: ${a.asset_type} &bull; ${a.track_name}</option>
    `).join('');
  } catch (err) {
    assetSelect.innerHTML = `<option value="">Failed to load assets</option>`;
  }
}

/**
 * Auto-translates dropdown selection to default time:
 * Routine=30, Repair=60, Emergency=100
 */
function handleIssueTypeChange() {
  const issueType = document.getElementById("issueType").value;
  const reqTimeInput = document.getElementById("requiredTime");
  if (!reqTimeInput) return;

  if (issueType === "Routine") {
    reqTimeInput.value = 30;
  } else if (issueType === "Repair") {
    reqTimeInput.value = 60;
  } else if (issueType === "Emergency") {
    reqTimeInput.value = 100;
  }
}

async function handleDefectSubmit(e) {
  e.preventDefault();
  dismissAlert();

  const empId = sessionStorage.getItem("empId");
  const assetId = parseInt(document.getElementById("assetSelect").value);
  const issueType = document.getElementById("issueType").value;
  const requiredTime = parseInt(document.getElementById("requiredTime").value);

  if (!assetId) {
    showAlert("Please select an asset.", "error");
    return;
  }

  let severityScore = 30;
  let isEmergency = false;

  if (issueType === "Repair") {
    severityScore = 60;
  } else if (issueType === "Emergency") {
    severityScore = 100;
    isEmergency = true;
  }

  const payload = {
    reportedby_empid: empId,
    assetid: assetId,
    issue_type: issueType,
    estimated_mins: requiredTime,
    severity_score: severityScore,
    is_emergency: isEmergency
  };

  const btn = document.getElementById("submitDefectBtn");
  btn.disabled = true;
  btn.textContent = "Submitting to Katpadi Control Room...";

  try {
    const res = await fetch(`${API_BASE}/defects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Failed to submit defect.", "error");
    } else {
      showAlert(`Defect #${data.defectid} registered with status 'Pending' for Katpadi region.`, "success");
      document.getElementById("defectForm").reset();
      handleIssueTypeChange();
      await loadEngineerAssets();
      await refreshEngineerData();
    }
  } catch (err) {
    showAlert("Network Error: Could not submit defect.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Defect to Station Master";
  }
}

/**
 * Fetches all defects across Katpadi region and partitions them
 * for the Engineer Dashboard:
 *  - "My Department's Requests"
 *  - "Other Departments' Requests"
 */
async function fetchDefects() {
  try {
    const res = await fetch(`${API_BASE}/defects`);
    if (!res.ok) throw new Error("Could not fetch defects");
    const defects = await res.json();

    const role = sessionStorage.getItem("userRole");
    if (role === "engineer") {
      const userDeptId = parseInt(sessionStorage.getItem("deptId"));
      const myDefects = defects.filter(d => Number(d.deptid) === userDeptId);
      const otherDefects = defects.filter(d => Number(d.deptid) !== userDeptId);

      renderMyDefectsTable(myDefects);
      renderOtherDefectsTable(otherDefects);
    } else if (role === "master") {
      renderControllerDefectsTable(defects);
    }
  } catch (err) {
    console.error("fetchDefects Error:", err);
  }
}

/**
 * TASK 1: Render ONLY the defects reported by the logged-in engineer's department.
 */
function renderMyDefectsTable(defects) {
  const tbody = document.getElementById("myDefectsTableBody");
  const countBadge = document.getElementById("myDefectsCountBadge");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${defects.length} Requests`;

  if (defects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-medium">No defects currently recorded for your department.</td></tr>';
    return;
  }

  tbody.innerHTML = defects.map(d => {
    const severityBadge = getSeverityBadge(d.issue_type || d.severity_score, d.is_emergency);
    const statusBadge = getStatusBadge(d.status);

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-3 font-mono font-bold text-slate-800">#${d.defectid}</td>
        <td class="py-3 px-3 font-medium text-slate-900">${d.asset_type}</td>
        <td class="py-3 px-3 font-semibold text-blue-700">${d.track_name}</td>
        <td class="py-3 px-3">${severityBadge}</td>
        <td class="py-3 px-3 font-bold text-slate-700">${d.estimated_mins}m</td>
        <td class="py-3 px-3 text-slate-600">
          <div class="font-medium">${d.reported_by}</div>
          <div class="text-[10px] text-slate-400 font-mono">${d.reportedby_empid}</div>
        </td>
        <td class="py-3 px-3">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

/**
 * TASK 1: Render requests from all other departments in a completely separate table.
 */
function renderOtherDefectsTable(defects) {
  const tbody = document.getElementById("otherDefectsTableBody");
  const countBadge = document.getElementById("otherDefectsCountBadge");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = `${defects.length} Requests`;

  if (defects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-slate-400 font-medium">No active defects from other departments.</td></tr>';
    return;
  }

  tbody.innerHTML = defects.map(d => {
    const severityBadge = getSeverityBadge(d.issue_type || d.severity_score, d.is_emergency);
    const deptBadge = getDepartmentBadge(d.dept_name);
    const statusBadge = getStatusBadge(d.status);

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-3 font-mono font-bold text-slate-700">#${d.defectid}</td>
        <td class="py-3 px-3">${deptBadge}</td>
        <td class="py-3 px-3 font-medium text-slate-900">${d.asset_type}</td>
        <td class="py-3 px-3 font-semibold text-blue-700">${d.track_name}</td>
        <td class="py-3 px-3">${severityBadge}</td>
        <td class="py-3 px-3 font-semibold text-slate-700">${d.estimated_mins}m</td>
        <td class="py-3 px-3 text-slate-600">
          <div>${d.reported_by}</div>
        </td>
        <td class="py-3 px-3">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

/**
 * TASK 1: Dedicated section showing the final scheduled/approved maintenance blocks
 * that apply to the logged-in department, highlighting COLLABORATIVE blocks.
 */
async function fetchEngineerApprovedBlocks() {
  const tbody = document.getElementById("myApprovedBlocksTableBody");
  const countBadge = document.getElementById("myApprovedBlocksCountBadge");
  if (!tbody) return;

  const userDeptId = parseInt(sessionStorage.getItem("deptId"));

  try {
    const res = await fetch(`${API_BASE}/blocks?status=Approved`);
    if (!res.ok) throw new Error("Could not fetch approved blocks");
    const blocks = await res.json();

    // Filter to blocks that include the engineer's department
    const myApprovedBlocks = blocks.filter(b => {
      if (b.block_status !== "Approved") return false;
      const deptList = (b.dept_ids || []).map(Number);
      return deptList.includes(userDeptId);
    });

    if (countBadge) countBadge.textContent = `${myApprovedBlocks.length} Approved Blocks`;

    if (myApprovedBlocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-slate-400 font-medium">No approved maintenance blocks currently assigned to your department.</td></tr>';
      return;
    }

    tbody.innerHTML = myApprovedBlocks.map(b => {
      const isCollab = b.is_collaborative === true || (b.dept_count && b.dept_count > 1);
      const rowStyle = isCollab
        ? "bg-indigo-50/50 hover:bg-indigo-50 transition border-l-4 border-l-indigo-600 border-b border-indigo-100"
        : "hover:bg-slate-50 transition border-b border-slate-100";

      const collabBadge = isCollab
        ? `<div class="space-y-0.5">
             <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-300 shadow-xs">
               🤝 Collaborative Block
             </span>
             <p class="text-[10px] text-indigo-700 font-medium">Shared track possession window</p>
           </div>`
        : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Single Department</span>`;

      const severityBadge = getSeverityBadge(b.highest_severity_text || b.max_severity, b.has_emergency);
      const startFormatted = formatDisplayDateTime(b.start_time);
      const endFormatted = formatDisplayDateTime(b.end_time);

      return `
        <tr class="${rowStyle}">
          <td class="py-3 px-3 font-mono font-bold text-slate-900">#${b.blockid}</td>
          <td class="py-3 px-3 font-semibold text-blue-700">${b.track_name}</td>
          <td class="py-3 px-3 font-mono text-emerald-800 font-semibold">${startFormatted}</td>
          <td class="py-3 px-3 font-mono text-rose-800 font-semibold">${endFormatted}</td>
          <td class="py-3 px-3 font-bold text-slate-800">${b.duration_minutes} min</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded bg-slate-100 font-medium text-slate-800 text-[11px]">${b.departments}</span>
          </td>
          <td class="py-3 px-3">${severityBadge}</td>
          <td class="py-3 px-3">${collabBadge}</td>
          <td class="py-3 px-3">${getStatusBadge(b.block_status)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-rose-500">Failed to load approved maintenance blocks.</td></tr>';
  }
}


// =========================================================
// 5. STATION MASTER DASHBOARD & CONTROLLER VIEWS
// =========================================================

async function refreshControllerData() {
  await fetchTrainMovements();
  await fetchDefects();
  await fetchProposedBlocks();
  await fetchControllerApprovedBlocks();
}

/**
 * Fetches active train movements for Katpadi region
 */
async function fetchTrainMovements() {
  const tbody = document.getElementById("trainMovementsTableBody");
  const badge = document.getElementById("movementsCountBadge");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/train-movements`);
    if (!res.ok) throw new Error("Could not load train movements");
    const movements = await res.json();

    if (badge) badge.textContent = `${movements.length} Trains Scheduled`;

    if (movements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-medium">No active train movements recorded for Katpadi region.</td></tr>';
      return;
    }

    tbody.innerHTML = movements.map(m => {
      const entryFormatted = formatDisplayDateTime(m.entry_time);
      const exitFormatted = formatDisplayDateTime(m.exit_time);

      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="py-3 px-3 font-mono font-bold text-slate-700">#${m.movementid}</td>
          <td class="py-3 px-3 font-mono font-bold text-blue-700">${m.train_number}</td>
          <td class="py-3 px-3 font-semibold text-slate-900">${m.train_name}</td>
          <td class="py-3 px-3 text-slate-700 font-medium">${m.track_name}</td>
          <td class="py-3 px-3 font-mono text-emerald-700 font-semibold">${entryFormatted}</td>
          <td class="py-3 px-3 font-mono text-rose-700 font-semibold">${exitFormatted}</td>
          <td class="py-3 px-3 text-slate-500">${m.region}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-rose-500">Failed to load Katpadi train movements.</td></tr>';
  }
}

/**
 * TASK 2: Station Master Pending Defects - Strict Severity Text Translation
 */
function renderControllerDefectsTable(defects) {
  const tbody = document.getElementById("controllerDefectsTableBody");
  const badge = document.getElementById("pendingCountBadge");
  if (!tbody) return;

  const pending = defects.filter(d => (d.status || '').toLowerCase() === 'pending');
  if (badge) badge.textContent = `${pending.length} Pending`;

  if (pending.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="py-6 text-center text-slate-400 font-medium">All Katpadi defects have been scheduled into maintenance blocks.</td></tr>';
    return;
  }

  tbody.innerHTML = pending.map(d => {
    const severityBadge = getSeverityBadge(d.issue_type || d.severity_score, d.is_emergency);
    const deptBadge = getDepartmentBadge(d.dept_name);

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="py-3 px-3 font-mono font-bold text-slate-800">#${d.defectid}</td>
        <td class="py-3 px-3 font-medium text-slate-900">${d.asset_type}</td>
        <td class="py-3 px-3 font-semibold text-blue-700">${d.track_name}</td>
        <td class="py-3 px-3">${deptBadge}</td>
        <td class="py-3 px-3">${severityBadge}</td>
        <td class="py-3 px-3 font-bold text-slate-700">${d.estimated_mins} min</td>
        <td class="py-3 px-3 text-slate-600">
          <div class="font-medium">${d.reported_by}</div>
          <div class="text-[10px] text-slate-400 font-mono">${d.reportedby_empid}</div>
        </td>
        <td class="py-3 px-3">${getStatusBadge(d.status)}</td>
      </tr>
    `;
  }).join('');
}


// =========================================================
// 6. ALGORITHM PROPOSED BLOCKS & STATION MASTER APPROVAL
// =========================================================

/**
 * TASK 2: Detailed Block Visualization & Multi-Department Collaborative Block Highlight
 * Displays Department(s), Highest Severity/Issue Type, editable Start & End times, and Approve button.
 */
async function fetchProposedBlocks() {
  const tbody = document.getElementById("blocksTableBody");
  const countBadge = document.getElementById("proposedBlocksCountBadge");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/blocks?status=Algorithm_Proposed`);
    if (!res.ok) throw new Error("Could not fetch proposed blocks");
    const blocks = await res.json();

    if (countBadge) countBadge.textContent = `${blocks.length} Proposed`;

    if (blocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400 font-medium">No algorithm proposed blocks currently pending approval. Click "⚡ Run Scheduling Algorithm" above.</td></tr>';
      return;
    }

    tbody.innerHTML = blocks.map(b => {
      const startIso = formatForDatetimeLocal(b.start_time);
      const endIso = formatForDatetimeLocal(b.end_time);
      const severityBadge = getSeverityBadge(b.highest_severity_text || b.max_severity, b.has_emergency);
      const isCollab = b.is_collaborative === true || (b.dept_count && b.dept_count > 1);

      const rowClass = isCollab
        ? "bg-purple-50/50 hover:bg-purple-50 transition border-l-4 border-l-purple-600 border-b border-purple-100"
        : "hover:bg-slate-50 transition border-b border-slate-100";

      const collabBadge = isCollab
        ? `<div class="space-y-0.5">
             <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 shadow-xs">
               🤝 Multi-Department Collaborative Block
             </span>
             <p class="text-[10px] text-purple-700 font-medium">${b.dept_count} Departments Joint Work</p>
           </div>`
        : `<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Single Department</span>`;

      return `
        <tr class="${rowClass}" id="block-row-${b.blockid}">
          <td class="py-3 px-3 font-mono font-bold text-slate-900">#${b.blockid}</td>
          <td class="py-3 px-3 font-semibold text-blue-700">${b.track_name}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium text-xs">${b.departments}</span>
          </td>
          <td class="py-3 px-3">${severityBadge}</td>
          <td class="py-3 px-3 font-bold text-slate-800">${b.duration_minutes}m</td>
          <td class="py-3 px-3">
            <input
              type="datetime-local"
              id="start-time-${b.blockid}"
              value="${startIso}"
              class="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-mono font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
            >
          </td>
          <td class="py-3 px-3">
            <input
              type="datetime-local"
              id="end-time-${b.blockid}"
              value="${endIso}"
              class="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-mono font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-xs"
            >
          </td>
          <td class="py-3 px-3">${collabBadge}</td>
          <td class="py-3 px-3 text-right">
            <button
              onclick="approveBlock(${b.blockid})"
              class="py-1.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition duration-150 inline-flex items-center space-x-1"
            >
              <span>✓ Approve Block</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-rose-500">Failed to load proposed blocks.</td></tr>';
  }
}

/**
 * Station Master View: Approved Blocks (Locked Schedule)
 */
async function fetchControllerApprovedBlocks() {
  const tbody = document.getElementById("controllerApprovedBlocksTableBody");
  const countBadge = document.getElementById("controllerApprovedCountBadge");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/blocks?status=Approved`);
    if (!res.ok) throw new Error("Could not fetch approved blocks");
    const blocks = await res.json();

    if (countBadge) countBadge.textContent = `${blocks.length} Approved`;

    if (blocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-slate-400 font-medium">No finalized blocks approved yet.</td></tr>';
      return;
    }

    tbody.innerHTML = blocks.map(b => {
      const severityBadge = getSeverityBadge(b.highest_severity_text || b.max_severity, b.has_emergency);
      const isCollab = b.is_collaborative === true || (b.dept_count && b.dept_count > 1);

      const rowClass = isCollab
        ? "bg-purple-50/50 hover:bg-purple-50 transition border-l-4 border-l-purple-600 border-b border-purple-100"
        : "hover:bg-slate-50 transition border-b border-slate-100";

      const collabBadge = isCollab
        ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 shadow-xs">
             🤝 Multi-Department Collaborative Block
           </span>`
        : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Single Department</span>`;

      return `
        <tr class="${rowClass}">
          <td class="py-3 px-3 font-mono font-bold text-slate-900">#${b.blockid}</td>
          <td class="py-3 px-3 font-semibold text-blue-700">${b.track_name}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-medium text-xs">${b.departments}</span>
          </td>
          <td class="py-3 px-3">${severityBadge}</td>
          <td class="py-3 px-3 font-mono text-emerald-800 font-semibold">${formatDisplayDateTime(b.start_time)}</td>
          <td class="py-3 px-3 font-mono text-rose-800 font-semibold">${formatDisplayDateTime(b.end_time)}</td>
          <td class="py-3 px-3 font-bold text-slate-800">${b.duration_minutes} min</td>
          <td class="py-3 px-3">${collabBadge}</td>
          <td class="py-3 px-3">${getStatusBadge(b.block_status)}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-rose-500">Failed to load approved maintenance blocks.</td></tr>';
  }
}

/**
 * Approve block with potential datetime overrides
 */
async function approveBlock(blockId) {
  const startInput = document.getElementById(`start-time-${blockId}`);
  const endInput = document.getElementById(`end-time-${blockId}`);

  if (!startInput || !endInput) return;

  const startVal = startInput.value;
  const endVal = endInput.value;

  if (!startVal || !endVal) {
    showAlert("Please specify both Start Time and End Time.", "error");
    return;
  }

  const startDate = new Date(startVal);
  const endDate = new Date(endVal);

  if (endDate <= startDate) {
    showAlert("Invalid Window: End Time must be strictly after Start Time.", "error");
    return;
  }

  const diffMinutes = (endDate - startDate) / (1000 * 60);
  if (diffMinutes < 180) {
    if (!confirm(`Warning: The selected window duration is ${diffMinutes} minutes, which is under the 180-minute safety guideline. Do you still wish to manually approve?`)) {
      return;
    }
  }

  const payload = {
    blockid: blockId,
    new_start_time: startDate.toISOString(),
    new_end_time: endDate.toISOString()
  };

  try {
    const res = await fetch(`${API_BASE}/blocks/approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Approval failed.", "error");
    } else {
      showAlert(`Block #${blockId} approved and schedule locked!`, "success");
      await refreshControllerData();
    }
  } catch (err) {
    showAlert("Network Error: Could not approve maintenance block.", "error");
  }
}

/**
 * Triggers the CP-SAT scheduling algorithm
 */
async function runSchedulingAlgorithm() {
  const btn = document.getElementById("runAlgorithmBtn");
  const spinner = document.getElementById("algoSpinner");
  const btnText = document.getElementById("algoBtnText");

  btn.disabled = true;
  spinner.classList.remove("hidden");
  btnText.textContent = "Solving CP-SAT Optimizer...";
  showAlert("Running Google OR-Tools CP-SAT scheduling algorithm for Katpadi region...", "info");

  try {
    const res = await fetch(`${API_BASE}/generate-schedule`, {
      method: "POST"
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || "Scheduling algorithm encountered an error.", "error");
    } else {
      if (data.status === "INFEASIBLE") {
        showAlert(data.message || "There is no required gap for block allocation. Suggest taking manual action.", "error");
      } else {
        showAlert(data.message || `CP-SAT optimizer finished: ${data.blocks_created || 0} blocks proposed.`, data.blocks_created > 0 ? "success" : "info");
      }
      await refreshControllerData();
    }
  } catch (err) {
    showAlert("Network Error: Could not contact scheduling service.", "error");
  } finally {
    btn.disabled = false;
    spinner.classList.add("hidden");
    btnText.textContent = "⚡ Run Scheduling Algorithm";
  }
}
