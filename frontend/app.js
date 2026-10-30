/**
 * TRACKSAFE: RAILWAY MAINTENANCE BLOCK SCHEDULING SYSTEM (KATPADI REGION)
 * Indian Railways - Southern Railway Zone (Chennai Division &bull; Katpadi Junction)
 * Pure Vanilla JavaScript Client & Official Enterprise UI/UX Engine
 * 
 * Strict Frontend-Only Implementation:
 * - Official Indian Railways enterprise branding and color palette
 * - High-readability multi-track Corridor Gantt Chart
 * - Department-differentiated color coding:
 *     Track Engineering = Deep Blue (#1e40af)
 *     Signal & Telecom = Amber / Orange (#ea580c)
 *     Electrical OHE = Crimson / Red (#be123c)
 *     Collaborative = Purple (#6d28d9)
 *     Train Movements = Steel / Charcoal Navy (#334155)
 * - Clear X-axis (Time with 24h stamps & dates) and Y-axis (Katpadi Track Names)
 * - Interactive hover popovers showing Block ID, Department, Duration, and Window
 * - Dual Gantt / Table visualization for Approved Maintenance Blocks
 */

const API_BASE = "http://localhost:8000/api";

// Standard Katpadi Junction (KPD) corridor tracks
const DEFAULT_KATPADI_TRACKS = [
  "UP Main Line (AJJ - KPD)",
  "DOWN Main Line (KPD - AJJ)",
  "UP Main Line (KPD - JTJ)",
  "DOWN Main Line (JTJ - KPD)",
  "Branch Line (KPD - VLR)",
  "Katpadi Goods Loop Line"
];

// Global Schedule Cache for Gantt visualization
let ganttTrainMovements = [];
let ganttProposedBlocks = [];
let ganttApprovedBlocks = [];
let selectedGanttDate = null;
let ganttDatePreset = "day"; // "day" (24-hour single day view) or "all" (multi-day overview)

// =========================================================
// 1. INITIALIZATION & SESSION MANAGEMENT
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  setupGanttTooltipTracker();
  
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

  if (!alertBox || !alertContent || !alertMessage || !alertIcon) return;

  alertBox.classList.remove("hidden");
  alertMessage.textContent = message;

  if (type === "error") {
    alertIcon.textContent = "⚠️";
    alertContent.className = "p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-sm bg-rose-50 text-rose-900 border-2 border-rose-300";
  } else if (type === "success") {
    alertIcon.textContent = "✅";
    alertContent.className = "p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-sm bg-emerald-50 text-emerald-900 border-2 border-emerald-300";
  } else {
    alertIcon.textContent = "ℹ️";
    alertContent.className = "p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow-sm bg-blue-50 text-blue-900 border-2 border-blue-300";
  }
}

function dismissAlert() {
  const alertBox = document.getElementById("alertBox");
  if (alertBox) alertBox.classList.add("hidden");
}

function logout() {
  sessionStorage.clear();
  const userBar = document.getElementById("userBar");
  const engDash = document.getElementById("engineerDashboard");
  const ctlDash = document.getElementById("controllerDashboard");
  const loginScr = document.getElementById("loginScreen");

  if (userBar) userBar.classList.add("hidden");
  if (engDash) engDash.classList.add("hidden");
  if (ctlDash) ctlDash.classList.add("hidden");
  if (loginScr) loginScr.classList.remove("hidden");
  dismissAlert();
}

function renderCurrentSession() {
  const role = sessionStorage.getItem("userRole");
  const empName = sessionStorage.getItem("empName") || "Railway Official";
  const empId = sessionStorage.getItem("empId") || "";
  const deptName = sessionStorage.getItem("deptName") || "";

  const loginScr = document.getElementById("loginScreen");
  const userBar = document.getElementById("userBar");
  const engDash = document.getElementById("engineerDashboard");
  const ctlDash = document.getElementById("controllerDashboard");

  if (loginScr) loginScr.classList.add("hidden");
  if (userBar) userBar.classList.remove("hidden");

  if (role === "master") {
    const headerLabel = document.getElementById("headerUserLabel");
    const masterLabel = document.getElementById("masterNameLabel");
    if (headerLabel) headerLabel.textContent = `Station Master: ${empName}`;
    if (masterLabel) masterLabel.textContent = empName;

    if (ctlDash) ctlDash.classList.remove("hidden");
    if (engDash) engDash.classList.add("hidden");

    // Restore view preference for approved blocks (default: gantt)
    const savedApprovedView = sessionStorage.getItem("approvedViewMode") || "gantt";
    toggleApprovedView(savedApprovedView);

    refreshControllerData();
  } else if (role === "engineer") {
    const headerLabel = document.getElementById("headerUserLabel");
    const engDeptBadge = document.getElementById("engineerDeptBadge");
    const myDeptBoxBadge = document.getElementById("myDeptBoxBadge");
    const engNameLabel = document.getElementById("engineerNameLabel");
    const engIdLabel = document.getElementById("engineerIdLabel");

    if (headerLabel) headerLabel.textContent = `${empName} (${deptName})`;
    if (engDeptBadge) engDeptBadge.textContent = `Department: ${deptName}`;
    if (myDeptBoxBadge) myDeptBoxBadge.textContent = deptName;
    if (engNameLabel) engNameLabel.textContent = empName;
    if (engIdLabel) engIdLabel.textContent = empId;

    if (engDash) engDash.classList.remove("hidden");
    if (ctlDash) ctlDash.classList.add("hidden");

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
  btn.textContent = "Authenticating with Southern Railway Control...";

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
      showAlert(`Welcome, Station Master ${data.user.name}. Authenticated for Katpadi Station Control Room.`, "success");
      renderCurrentSession();
    }
  } catch (err) {
    showAlert("Network Error: Ensure backend is running at http://localhost:8000", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login as Station Master →";
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
  btn.textContent = "Verifying Department Credentials...";

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
      showAlert(`Welcome, ${data.user.name}. Authorized for ${data.user.dept_name} (Katpadi Region).`, "success");
      renderCurrentSession();
    }
  } catch (err) {
    showAlert("Network Error: Ensure backend is running at http://localhost:8000", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Login as Maintenance Engineer →";
  }
}


// =========================================================
// 3. DEPARTMENT COLOR CODING & VISUAL STYLING ENGINE
// =========================================================

/**
 * Returns distinct, official colors for Gantt visualization and cards:
 * - Track Engineering = Deep Blue (#1e40af)
 * - Signal & Telecom = Amber / Orange (#ea580c)
 * - Electrical OHE = Crimson / Red (#be123c)
 * - Collaborative = Purple (#6d28d9)
 */
function getDepartmentVisuals(departmentsStr, isCollaborative = false, deptCount = 1) {
  // 1. Collaborative Check (Multi-Department)
  if (isCollaborative || (deptCount && deptCount > 1) || (departmentsStr && departmentsStr.includes(','))) {
    return {
      department: "Collaborative",
      displayName: `Collaborative (${departmentsStr || "Joint Work"})`,
      colorName: "Purple",
      hex: "#6d28d9",
      bgClass: "bg-purple-700",
      hoverBgClass: "hover:bg-purple-800",
      borderClass: "border-purple-800",
      textClass: "text-white",
      badgeClass: "bg-purple-100 text-purple-900 border-purple-300",
      emoji: "🤝",
      tagLabel: "Joint Block"
    };
  }

  const dept = (departmentsStr || "").toLowerCase().trim();

  // 2. Track Engineering -> Deep Blue
  if (dept.includes("track")) {
    return {
      department: "Track Engineering",
      displayName: "Track Engineering",
      colorName: "Deep Blue",
      hex: "#1e40af",
      bgClass: "bg-blue-800",
      hoverBgClass: "hover:bg-blue-900",
      borderClass: "border-blue-900",
      textClass: "text-white",
      badgeClass: "bg-blue-100 text-blue-900 border-blue-300",
      emoji: "🔧",
      tagLabel: "Track Eng"
    };
  }

  // 3. Signal & Telecom -> Amber / Orange
  if (dept.includes("signal") || dept.includes("telecom")) {
    return {
      department: "Signal & Telecom",
      displayName: "Signal & Telecom",
      colorName: "Amber/Orange",
      hex: "#ea580c",
      bgClass: "bg-amber-600",
      hoverBgClass: "hover:bg-amber-700",
      borderClass: "border-amber-700",
      textClass: "text-white",
      badgeClass: "bg-amber-100 text-amber-900 border-amber-300",
      emoji: "📡",
      tagLabel: "Signal & Telecom"
    };
  }

  // 4. Electrical (OHE) -> Crimson / Red
  if (dept.includes("electrical") || dept.includes("ohe")) {
    return {
      department: "Electrical (OHE)",
      displayName: "Electrical OHE",
      colorName: "Crimson/Red",
      hex: "#be123c",
      bgClass: "bg-rose-700",
      hoverBgClass: "hover:bg-rose-800",
      borderClass: "border-rose-800",
      textClass: "text-white",
      badgeClass: "bg-rose-100 text-rose-900 border-rose-300",
      emoji: "⚡",
      tagLabel: "Electrical OHE"
    };
  }

  // Fallback -> Official Deep Navy
  return {
    department: departmentsStr || "General",
    displayName: departmentsStr || "General Maintenance",
    colorName: "Deep Blue",
    hex: "#1e3a8a",
    bgClass: "bg-blue-900",
    hoverBgClass: "hover:bg-blue-950",
    borderClass: "border-blue-950",
    textClass: "text-white",
    badgeClass: "bg-slate-100 text-slate-800 border-slate-300",
    emoji: "🛠️",
    tagLabel: "Maintenance"
  };
}

/**
 * Severity badge formatter
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
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300 shadow-xs">
      <span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping"></span>
      🚨 Emergency
    </span>`;
  } else if (label === "Repair") {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
      🛠️ Repair
    </span>`;
  } else {
    return `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-900 border border-blue-200">
      📋 Routine
    </span>`;
  }
}

/**
 * Returns color-coded badge for defect and block statuses.
 */
function getStatusBadge(status) {
  const s = (status || "").toLowerCase().trim();
  if (s === "in progress" || s === "in_progress") {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-950 border border-amber-400 shadow-xs animate-pulse">
      <span class="relative flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-500 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-amber-600"></span>
      </span>
      <span>⚡ In Progress</span>
      <span class="text-[10px] text-amber-900 font-bold bg-amber-200/60 border border-amber-300 px-1 py-0.2 rounded">Active Possession</span>
    </span>`;
  } else if (s === "completed") {
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-xs border border-emerald-700">
      <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
      </svg>
      <span>Completed</span>
      <span class="text-[10px] bg-emerald-700 text-emerald-100 px-1.5 py-0.2 rounded font-medium">Track Cleared</span>
    </span>`;
  } else if (s === "approved") {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-300">Approved</span>`;
  } else if (s === "pending") {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">Pending</span>`;
  } else if (s === "algorithm_proposed") {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300">Algorithm Proposed</span>`;
  } else {
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">${status || "Unknown"}</span>`;
  }
}

/**
 * Returns distinct badge styling per railway department.
 */
function getDepartmentBadge(deptName) {
  const vis = getDepartmentVisuals(deptName);
  return `<span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold ${vis.badgeClass} border">${vis.emoji} ${vis.displayName}</span>`;
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

function formatDuration(mins) {
  const m = Number(mins) || 0;
  const hours = Math.floor(m / 60);
  const remMins = m % 60;
  if (hours > 0) {
    return `${m}m (${hours}h ${remMins > 0 ? remMins + 'm' : ''})`;
  }
  return `${m} mins`;
}


// =========================================================
// 4. FLOATING GANTT TOOLTIP / POPOVER ENGINE
// =========================================================

let tooltipElement = null;
let tooltipContentElement = null;

function setupGanttTooltipTracker() {
  tooltipElement = document.getElementById("ganttTooltip");
  tooltipContentElement = document.getElementById("ganttTooltipContent");
  
  if (!tooltipElement) return;

  // Global mousemove to reposition active tooltip
  document.addEventListener("mousemove", (e) => {
    if (tooltipElement && !tooltipElement.classList.contains("hidden")) {
      positionTooltip(e.clientX, e.clientY);
    }
  });
}

function showGanttTooltip(clientX, clientY, htmlContent) {
  if (!tooltipElement || !tooltipContentElement) return;
  tooltipContentElement.innerHTML = htmlContent;
  tooltipElement.classList.remove("hidden");
  positionTooltip(clientX, clientY);
}

function positionTooltip(x, y) {
  if (!tooltipElement) return;
  const offset = 16;
  const tooltipRect = tooltipElement.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = x + offset;
  let top = y + offset;

  // Prevent right edge overflow
  if (left + tooltipRect.width > viewportWidth - 20) {
    left = x - tooltipRect.width - offset;
  }
  // Prevent bottom edge overflow
  if (top + tooltipRect.height > viewportHeight - 20) {
    top = y - tooltipRect.height - offset;
  }

  tooltipElement.style.left = `${Math.max(10, left)}px`;
  tooltipElement.style.top = `${Math.max(10, top)}px`;
}

function hideGanttTooltip() {
  if (tooltipElement) {
    tooltipElement.classList.add("hidden");
  }
}


// =========================================================
// 5. ENGINEER CONSOLE & DEFECT LOGGING
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
    showAlert("Please select an asset in Katpadi region.", "error");
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
        <td class="py-3 px-3 font-semibold text-blue-800">${d.track_name}</td>
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
        <td class="py-3 px-3 font-semibold text-blue-800">${d.track_name}</td>
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

async function fetchEngineerApprovedBlocks() {
  const tbody = document.getElementById("myApprovedBlocksTableBody");
  const countBadge = document.getElementById("myApprovedBlocksCountBadge");
  if (!tbody) return;

  const userDeptId = parseInt(sessionStorage.getItem("deptId"));

  try {
    const res = await fetch(`${API_BASE}/blocks?status=Approved,In Progress,Completed`);
    if (!res.ok) throw new Error("Could not fetch approved blocks");
    const blocks = await res.json();

    const myApprovedBlocks = blocks.filter(b => {
      if (!["Approved", "In Progress", "Completed"].includes(b.block_status)) return false;
      const deptList = (b.dept_ids || []).map(Number);
      return deptList.includes(userDeptId);
    });

    if (countBadge) countBadge.textContent = `${myApprovedBlocks.length} Allocated Blocks`;

    if (myApprovedBlocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-slate-400 font-medium">No approved maintenance blocks currently assigned to your department.</td></tr>';
      return;
    }

    tbody.innerHTML = myApprovedBlocks.map(b => {
      const isCollab = b.is_collaborative === true || (b.dept_count && b.dept_count > 1);
      const rowStyle = isCollab
        ? "bg-purple-50/60 hover:bg-purple-50 transition border-l-4 border-l-purple-700 border-b border-purple-100"
        : "hover:bg-slate-50 transition border-b border-slate-100";

      const collabBadge = isCollab
        ? `<div class="space-y-0.5">
             <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 shadow-xs">
               🤝 Collaborative Block
             </span>
             <p class="text-[10px] text-purple-700 font-semibold">Shared track possession window</p>
           </div>`
        : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">Single Department</span>`;

      const severityBadge = getSeverityBadge(b.highest_severity_text || b.max_severity, b.has_emergency);
      const startFormatted = formatDisplayDateTime(b.start_time);
      const endFormatted = formatDisplayDateTime(b.end_time);

      let actionBtnHtml = '';
      if (b.block_status === 'Approved') {
        actionBtnHtml = `
          <button 
            onclick="updateBlockExecutionStatus(${b.blockid}, 'In Progress')" 
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs rounded-lg shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap"
            title="Start track possession and begin maintenance work"
          >
            <span>▶️</span> Start Work
          </button>
        `;
      } else if (b.block_status === 'In Progress') {
        actionBtnHtml = `
          <button 
            onclick="updateBlockExecutionStatus(${b.blockid}, 'Completed')" 
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm transition active:scale-95 cursor-pointer whitespace-nowrap"
            title="Mark maintenance complete and clear track for train traffic"
          >
            <span>✅</span> Mark Completed
          </button>
        `;
      } else if (b.block_status === 'Completed') {
        actionBtnHtml = `
          <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
            <span>✨</span> Track Cleared
          </span>
        `;
      }

      return `
        <tr class="${rowStyle}">
          <td class="py-3 px-3 font-mono font-bold text-slate-900">#${b.blockid}</td>
          <td class="py-3 px-3 font-semibold text-blue-800">${b.track_name}</td>
          <td class="py-3 px-3 font-mono text-emerald-800 font-semibold">${startFormatted}</td>
          <td class="py-3 px-3 font-mono text-rose-800 font-semibold">${endFormatted}</td>
          <td class="py-3 px-3 font-bold text-slate-800">${formatDuration(b.duration_minutes)}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded bg-slate-100 font-bold text-slate-800 text-[11px]">${b.departments}</span>
          </td>
          <td class="py-3 px-3">${severityBadge}</td>
          <td class="py-3 px-3">${collabBadge}</td>
          <td class="py-3 px-3">${getStatusBadge(b.block_status)}</td>
          <td class="py-3 px-3 text-right">${actionBtnHtml}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="10" class="py-6 text-center text-rose-500">Failed to load approved maintenance blocks.</td></tr>';
  }
}

async function updateBlockExecutionStatus(blockId, targetStatus) {
  const confirmMsg = targetStatus === 'In Progress'
    ? `Commence track maintenance for Block #${blockId}? This will set status to 'In Progress' and signal active track possession.`
    : `Mark Block #${blockId} as Completed? This confirms all repairs are finished and track is cleared for train traffic.`;

  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/blocks/${blockId}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: targetStatus })
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.detail || `Failed to update status to ${targetStatus}.`, "error");
      return;
    }

    showAlert(data.message || `Block #${blockId} status updated to ${targetStatus}!`, "success");

    await refreshEngineerData();
    if (typeof refreshControllerData === "function") {
      await refreshControllerData();
    }
  } catch (err) {
    console.error("updateBlockExecutionStatus Error:", err);
    showAlert("Network Error: Could not update block execution status.", "error");
  }
}
window.updateBlockExecutionStatus = updateBlockExecutionStatus;


// =========================================================
// 6. STATION MASTER DASHBOARD & CONTROLLER VIEWS
// =========================================================

async function refreshControllerData() {
  await fetchTrainMovements();
  await fetchDefects();
  await fetchProposedBlocks();
  await fetchControllerApprovedBlocks();
  renderGanttChart();
  renderApprovedBlocksGantt();
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
    ganttTrainMovements = movements || [];

    if (badge) badge.textContent = `${movements.length} Trains Scheduled`;

    if (movements.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-slate-400 font-medium">No active train movements recorded for Katpadi region.</td></tr>';
      renderGanttChart();
      return;
    }

    tbody.innerHTML = movements.map(m => {
      const entryFormatted = formatDisplayDateTime(m.entry_time);
      const exitFormatted = formatDisplayDateTime(m.exit_time);

      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="py-3 px-3 font-mono font-bold text-slate-700">#${m.movementid}</td>
          <td class="py-3 px-3 font-mono font-bold text-blue-800">${m.train_number}</td>
          <td class="py-3 px-3 font-semibold text-slate-900">${m.train_name}</td>
          <td class="py-3 px-3 text-slate-700 font-medium">${m.track_name}</td>
          <td class="py-3 px-3 font-mono text-emerald-800 font-semibold">${entryFormatted}</td>
          <td class="py-3 px-3 font-mono text-rose-800 font-semibold">${exitFormatted}</td>
          <td class="py-3 px-3 text-slate-500">${m.region}</td>
        </tr>
      `;
    }).join('');

    renderGanttChart();
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" class="py-6 text-center text-rose-500">Failed to load Katpadi train movements.</td></tr>';
  }
}

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
        <td class="py-3 px-3 font-semibold text-blue-800">${d.track_name}</td>
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

async function fetchProposedBlocks() {
  const tbody = document.getElementById("blocksTableBody");
  const countBadge = document.getElementById("proposedBlocksCountBadge");
  if (!tbody) return;

  try {
    const res = await fetch(`${API_BASE}/blocks?status=Algorithm_Proposed`);
    if (!res.ok) throw new Error("Could not fetch proposed blocks");
    const blocks = await res.json();
    ganttProposedBlocks = blocks || [];

    if (countBadge) countBadge.textContent = `${blocks.length} Proposed`;

    if (blocks.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="py-8 text-center text-slate-400 font-medium">No algorithm proposed blocks currently pending approval. Click "⚡ Run Scheduling Algorithm" above.</td></tr>';
      renderGanttChart();
      return;
    }

    tbody.innerHTML = blocks.map(b => {
      const startIso = formatForDatetimeLocal(b.start_time);
      const endIso = formatForDatetimeLocal(b.end_time);
      const severityBadge = getSeverityBadge(b.highest_severity_text || b.max_severity, b.has_emergency);
      const isCollab = b.is_collaborative === true || (b.dept_count && b.dept_count > 1);

      const rowClass = isCollab
        ? "bg-purple-50/60 hover:bg-purple-50 transition border-l-4 border-l-purple-700 border-b border-purple-100"
        : "hover:bg-slate-50 transition border-b border-slate-100";

      const collabBadge = isCollab
        ? `<div class="space-y-0.5">
             <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 shadow-xs">
               🤝 Multi-Department Collaborative Block
             </span>
             <p class="text-[10px] text-purple-700 font-semibold">${b.dept_count} Departments Joint Work</p>
           </div>`
        : `<span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">Single Department</span>`;

      return `
        <tr class="${rowClass}" id="block-row-${b.blockid}">
          <td class="py-3 px-3 font-mono font-bold text-slate-900">#${b.blockid}</td>
          <td class="py-3 px-3 font-semibold text-blue-800">${b.track_name}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-xs">${b.departments}</span>
          </td>
          <td class="py-3 px-3">${severityBadge}</td>
          <td class="py-3 px-3 font-bold text-slate-800">${formatDuration(b.duration_minutes)}</td>
          <td class="py-3 px-3">
            <input 
              type="datetime-local" 
              id="start-time-${b.blockid}" 
              value="${startIso}" 
              class="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-mono font-semibold focus:ring-2 focus:ring-[#0a2f5c] focus:outline-none shadow-xs"
            >
          </td>
          <td class="py-3 px-3">
            <input 
              type="datetime-local" 
              id="end-time-${b.blockid}" 
              value="${endIso}" 
              class="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-800 font-mono font-semibold focus:ring-2 focus:ring-[#0a2f5c] focus:outline-none shadow-xs"
            >
          </td>
          <td class="py-3 px-3">${collabBadge}</td>
          <td class="py-3 px-3 text-right">
            <button 
              onclick="approveBlock(${b.blockid})" 
              class="py-1.5 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs shadow-sm transition duration-150 inline-flex items-center space-x-1 cursor-pointer active:scale-95"
            >
              <span>✓ Approve Block</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');
    
    renderGanttChart();
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

  try {
    const res = await fetch(`${API_BASE}/blocks?status=Approved,In Progress,Completed`);
    if (!res.ok) throw new Error("Could not fetch approved blocks");
    const blocks = await res.json();

    const activeBlocks = blocks.filter(b => 
      ["Approved", "In Progress", "Completed"].includes(b.block_status)
    );
    ganttApprovedBlocks = activeBlocks || [];

    if (countBadge) countBadge.textContent = `${activeBlocks.length} Live / Approved`;

    if (tbody) {
      if (activeBlocks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-slate-400 font-medium">No finalized blocks approved yet.</td></tr>';
      } else {
        tbody.innerHTML = activeBlocks.map(b => {
          const severityBadge = getSeverityBadge(b.highest_severity_text || b.max_severity, b.has_emergency);
          const isCollab = b.is_collaborative === true || (b.dept_count && b.dept_count > 1);

          let rowClass = "hover:bg-slate-50 transition border-b border-slate-100";
          if (b.block_status === "In Progress") {
            rowClass = "bg-amber-50/80 hover:bg-amber-50 transition border-l-4 border-l-amber-500 border-b border-amber-200";
          } else if (b.block_status === "Completed") {
            rowClass = "bg-emerald-50/60 hover:bg-emerald-50 transition border-l-4 border-l-emerald-600 border-b border-emerald-100";
          } else if (isCollab) {
            rowClass = "bg-purple-50/60 hover:bg-purple-50 transition border-l-4 border-l-purple-700 border-b border-purple-100";
          }

          const collabBadge = isCollab
            ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-900 border border-purple-300 shadow-xs">
                 🤝 Multi-Department Collaborative Block
               </span>`
            : `<span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">Single Department</span>`;

          return `
            <tr class="${rowClass}">
              <td class="py-3 px-3 font-mono font-bold text-slate-900">#${b.blockid}</td>
              <td class="py-3 px-3 font-semibold text-blue-800">${b.track_name}</td>
              <td class="py-3 px-3">
                <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-xs">${b.departments}</span>
              </td>
              <td class="py-3 px-3">${severityBadge}</td>
              <td class="py-3 px-3 font-mono text-emerald-800 font-semibold">${formatDisplayDateTime(b.start_time)}</td>
              <td class="py-3 px-3 font-mono text-rose-800 font-semibold">${formatDisplayDateTime(b.end_time)}</td>
              <td class="py-3 px-3 font-bold text-slate-800">${formatDuration(b.duration_minutes)}</td>
              <td class="py-3 px-3">${collabBadge}</td>
              <td class="py-3 px-3">${getStatusBadge(b.block_status)}</td>
            </tr>
          `;
        }).join('');
      }
    }

    renderGanttChart();
    renderApprovedBlocksGantt();

  } catch (err) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="py-6 text-center text-rose-500">Failed to load approved maintenance blocks.</td></tr>';
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

  // Safety Validation: Ensure no overlap with scheduled train movements on the same track
  const blockData = (ganttProposedBlocks || []).find(b => Number(b.blockid) === Number(blockId));
  if (blockData && ganttTrainMovements && ganttTrainMovements.length > 0) {
    const trackName = blockData.track_name;
    const sTime = startDate.getTime();
    const eTime = endDate.getTime();

    const conflictingTrain = ganttTrainMovements.find(t => {
      if (t.track_name !== trackName) return false;
      const trainStart = new Date(t.entry_time).getTime();
      const trainEnd = new Date(t.exit_time).getTime();
      return (sTime < trainEnd && eTime > trainStart);
    });

    if (conflictingTrain) {
      showAlert(`Safety Conflict: Selected window overlaps with Train #${conflictingTrain.train_number} (${conflictingTrain.train_name}) on ${trackName} (${formatDisplayDateTime(conflictingTrain.entry_time)} to ${formatDisplayDateTime(conflictingTrain.exit_time)}). Maintenance blocks cannot be approved during train movements.`, "error");
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
      showAlert(`Block #${blockId} approved and corridor schedule locked!`, "success");
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


// =========================================================
// 7. TOGGLE VIEW: APPROVED BLOCKS (GANTT VS TABLE)
// =========================================================

function toggleApprovedView(mode) {
  sessionStorage.setItem("approvedViewMode", mode);

  const ganttContainer = document.getElementById("approvedBlocksGanttContainer");
  const tableContainer = document.getElementById("approvedBlocksTableContainer");
  const btnGantt = document.getElementById("btnViewApprovedGantt");
  const btnTable = document.getElementById("btnViewApprovedTable");

  if (!ganttContainer || !tableContainer) return;

  if (mode === "table") {
    ganttContainer.classList.add("hidden");
    tableContainer.classList.remove("hidden");

    if (btnGantt) {
      btnGantt.className = "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition duration-150 cursor-pointer flex items-center space-x-1.5";
    }
    if (btnTable) {
      btnTable.className = "px-3 py-1.5 rounded-lg bg-[#0a2f5c] text-white shadow-xs transition duration-150 cursor-pointer flex items-center space-x-1.5";
    }
  } else {
    // Default: Gantt Timeline
    tableContainer.classList.add("hidden");
    ganttContainer.classList.remove("hidden");

    if (btnGantt) {
      btnGantt.className = "px-3 py-1.5 rounded-lg bg-[#0a2f5c] text-white shadow-xs transition duration-150 cursor-pointer flex items-center space-x-1.5";
    }
    if (btnTable) {
      btnTable.className = "px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 transition duration-150 cursor-pointer flex items-center space-x-1.5";
    }

    renderApprovedBlocksGantt();
  }
}
window.toggleApprovedView = toggleApprovedView;


// =========================================================
// 8. DATE SELECTION & MULTI-DAY GANTT NAVIGATION ENGINE
// =========================================================

function formatLocalDateIso(d) {
  if (!d || isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getAvailableScheduleDates() {
  const datesSet = new Set();
  const addDate = (dStr) => {
    if (!dStr) return;
    const d = new Date(dStr);
    if (!isNaN(d.getTime())) {
      datesSet.add(formatLocalDateIso(d));
    }
  };

  (ganttTrainMovements || []).forEach(m => { addDate(m.entry_time); addDate(m.exit_time); });
  (ganttProposedBlocks || []).forEach(b => { addDate(b.start_time); addDate(b.end_time); });
  (ganttApprovedBlocks || []).forEach(b => { addDate(b.start_time); addDate(b.end_time); });

  return Array.from(datesSet).sort();
}

function getInitialScheduleDate() {
  const available = getAvailableScheduleDates();
  const todayStr = formatLocalDateIso(new Date());

  if (available.includes(todayStr)) {
    return todayStr;
  }
  // Primary active schedule date in database
  if (available.includes("2026-10-23")) {
    return "2026-10-23";
  }
  if (available.length > 0) {
    return available[0];
  }
  return todayStr;
}

function populateGanttDateSelect() {
  const select = document.getElementById("ganttDateSelect");
  if (!select) return;

  const available = getAvailableScheduleDates();
  if (!selectedGanttDate) {
    selectedGanttDate = getInitialScheduleDate();
  }

  const allDatesSet = new Set(available);
  if (selectedGanttDate && selectedGanttDate !== "all") {
    allDatesSet.add(selectedGanttDate);
  }
  const sortedDates = Array.from(allDatesSet).sort();

  let optionsHtml = '';
  sortedDates.forEach(dateStr => {
    const d = new Date(dateStr + "T00:00:00");
    const dayLabel = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

    // Count total events on this specific date
    const dayStart = d.getTime();
    const dayEnd = dayStart + (24 * 3600 * 1000);
    let count = 0;
    (ganttTrainMovements || []).forEach(m => {
      const s = new Date(m.entry_time).getTime();
      const e = new Date(m.exit_time).getTime();
      if (s < dayEnd && e > dayStart) count++;
    });
    (ganttProposedBlocks || []).forEach(b => {
      const s = new Date(b.start_time).getTime();
      const e = new Date(b.end_time).getTime();
      if (s < dayEnd && e > dayStart) count++;
    });
    (ganttApprovedBlocks || []).forEach(b => {
      const s = new Date(b.start_time).getTime();
      const e = new Date(b.end_time).getTime();
      if (s < dayEnd && e > dayStart) count++;
    });

    const isToday = dateStr === formatLocalDateIso(new Date());
    const countTag = count > 0 ? ` (${count} event${count === 1 ? '' : 's'})` : ' (0 events)';
    const todayTag = isToday ? ' [Today]' : '';

    optionsHtml += `<option value="${dateStr}">${dayLabel}${todayTag}${countTag}</option>`;
  });

  optionsHtml += `<option value="all">🌐 All Days (Multi-Day Overview)</option>`;
  select.innerHTML = optionsHtml;

  if (ganttDatePreset === "all") {
    select.value = "all";
  } else {
    select.value = selectedGanttDate;
  }

  updateDateControlUI();
}

function updateDateControlUI() {
  const select = document.getElementById("ganttDateSelect");
  const btnToday = document.getElementById("btnDayToday");
  const btnTomorrow = document.getElementById("btnDayTomorrow");
  const btnAll = document.getElementById("btnDayAll");
  const approvedBadge = document.getElementById("approvedGanttDateBadge");

  const todayStr = formatLocalDateIso(new Date());
  const activeBaseStr = getInitialScheduleDate();
  const d = new Date((activeBaseStr || todayStr) + "T00:00:00");
  d.setDate(d.getDate() + 1);
  const tomorrowStr = formatLocalDateIso(d);

  if (select) {
    select.value = ganttDatePreset === "all" ? "all" : (selectedGanttDate || activeBaseStr);
  }

  const activeClass = "px-3 py-1.5 rounded-lg font-bold transition shadow-xs cursor-pointer bg-[#0a2f5c] text-white active:scale-95";
  const inactiveClass = "px-3 py-1.5 rounded-lg font-bold transition shadow-xs cursor-pointer bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 active:scale-95";

  if (btnToday) {
    btnToday.className = (ganttDatePreset === "day" && (selectedGanttDate === activeBaseStr || selectedGanttDate === todayStr)) ? activeClass : inactiveClass;
  }
  if (btnTomorrow) {
    btnTomorrow.className = (ganttDatePreset === "day" && selectedGanttDate === tomorrowStr) ? activeClass : inactiveClass;
  }
  if (btnAll) {
    btnAll.className = (ganttDatePreset === "all") ? activeClass : "px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer bg-white text-slate-600 border border-slate-300 hover:bg-slate-100 active:scale-95";
  }

  if (approvedBadge) {
    if (ganttDatePreset === "all") {
      approvedBadge.textContent = "All Dates Overview";
    } else if (selectedGanttDate) {
      const curD = new Date(selectedGanttDate + "T00:00:00");
      approvedBadge.textContent = curD.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    }
  }
}

function handleGanttDateSelect(dateVal) {
  if (dateVal === "all") {
    ganttDatePreset = "all";
  } else {
    ganttDatePreset = "day";
    selectedGanttDate = dateVal;
  }
  updateDateControlUI();
  renderGanttChart();
  renderApprovedBlocksGantt();
}
window.handleGanttDateSelect = handleGanttDateSelect;

function stepGanttDate(step) {
  if (!selectedGanttDate) {
    selectedGanttDate = getInitialScheduleDate();
  }
  const cur = new Date(selectedGanttDate + "T00:00:00");
  cur.setDate(cur.getDate() + step);
  selectedGanttDate = formatLocalDateIso(cur);
  ganttDatePreset = "day";

  populateGanttDateSelect();
  renderGanttChart();
  renderApprovedBlocksGantt();
}
window.stepGanttDate = stepGanttDate;

function setGanttDatePreset(preset) {
  ganttDatePreset = preset;
  if (preset === "today") {
    selectedGanttDate = getInitialScheduleDate();
  } else if (preset === "tomorrow") {
    const base = selectedGanttDate || getInitialScheduleDate();
    const cur = new Date(base + "T00:00:00");
    cur.setDate(cur.getDate() + 1);
    selectedGanttDate = formatLocalDateIso(cur);
  }
  populateGanttDateSelect();
  renderGanttChart();
  renderApprovedBlocksGantt();
}
window.setGanttDatePreset = setGanttDatePreset;


// =========================================================
// 9. MASTER CORRIDOR GANTT CHART ENGINE
// =========================================================

/**
 * Builds and renders the primary Multi-Track Corridor Gantt Chart.
 * Plots Train movements & Maintenance Blocks across Katpadi tracks.
 * Features clean 24-hour single-day focus to prevent timeline smearing.
 */
function renderGanttChart() {
  const wrapper = document.getElementById("ganttChartWrapper");
  const statsSpan = document.getElementById("ganttStatsSpan");
  const trackFilterSelect = document.getElementById("ganttFilterTrack");
  const typeFilterSelect = document.getElementById("ganttFilterType");
  const deptFilterSelect = document.getElementById("ganttFilterDept");
  if (!wrapper) return;

  if (!selectedGanttDate) {
    selectedGanttDate = getInitialScheduleDate();
  }
  populateGanttDateSelect();

  const typeFilter = typeFilterSelect ? typeFilterSelect.value : "all";
  const deptFilter = deptFilterSelect ? deptFilterSelect.value : "all";
  const trackFilter = trackFilterSelect ? trackFilterSelect.value : "all";

  // Collect all events for timeline plotting
  const events = [];

  // 1. Train Movements
  if (typeFilter === "all" || typeFilter === "trains") {
    (ganttTrainMovements || []).forEach(m => {
      const s = new Date(m.entry_time);
      const e = new Date(m.exit_time);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        events.push({
          type: "train",
          id: m.movementid,
          title: `Train ${m.train_number} - ${m.train_name}`,
          train_number: m.train_number,
          train_name: m.train_name,
          track_name: m.track_name || DEFAULT_KATPADI_TRACKS[0],
          start: s.getTime(),
          end: e.getTime(),
          durationMins: Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
          raw: m
        });
      }
    });
  }

  // 2. Algorithm Proposed Blocks
  if (typeFilter === "all" || typeFilter === "blocks" || typeFilter === "proposed") {
    (ganttProposedBlocks || []).forEach(b => {
      const s = new Date(b.start_time);
      const e = new Date(b.end_time);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        const visuals = getDepartmentVisuals(b.departments, b.is_collaborative, b.dept_count);
        events.push({
          type: "block",
          status: b.block_status || "Algorithm_Proposed",
          id: b.blockid,
          title: `Block #${b.blockid} (Proposed)`,
          track_name: b.track_name || DEFAULT_KATPADI_TRACKS[0],
          start: s.getTime(),
          end: e.getTime(),
          durationMins: b.duration_minutes || Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
          departments: b.departments,
          deptVisuals: visuals,
          raw: b
        });
      }
    });
  }

  // 3. Approved / In Progress / Completed Blocks
  if (typeFilter === "all" || typeFilter === "blocks" || typeFilter === "approved") {
    (ganttApprovedBlocks || []).forEach(b => {
      const s = new Date(b.start_time);
      const e = new Date(b.end_time);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        const visuals = getDepartmentVisuals(b.departments, b.is_collaborative, b.dept_count);
        events.push({
          type: "block",
          status: b.block_status || "Approved",
          id: b.blockid,
          title: `Block #${b.blockid} (${b.block_status})`,
          track_name: b.track_name || DEFAULT_KATPADI_TRACKS[0],
          start: s.getTime(),
          end: e.getTime(),
          durationMins: b.duration_minutes || Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000)),
          departments: b.departments,
          deptVisuals: visuals,
          raw: b
        });
      }
    });
  }

  // Populate track filter dropdown options if needed
  if (trackFilterSelect && trackFilterSelect.options.length <= 1) {
    const existingVal = trackFilterSelect.value;
    const allTracksSet = new Set(DEFAULT_KATPADI_TRACKS);
    events.forEach(ev => { if (ev.track_name) allTracksSet.add(ev.track_name); });
    trackFilterSelect.innerHTML = '<option value="all">All Katpadi Tracks</option>';
    Array.from(allTracksSet).sort().forEach(trk => {
      const opt = document.createElement("option");
      opt.value = trk;
      opt.textContent = trk;
      trackFilterSelect.appendChild(opt);
    });
    trackFilterSelect.value = existingVal || "all";
  }

  // Filter events by department if requested
  let filteredEvents = events;
  if (deptFilter !== "all") {
    filteredEvents = filteredEvents.filter(e => {
      if (e.type === "train") return false;
      if (deptFilter === "Collaborative") {
        return e.deptVisuals && e.deptVisuals.department === "Collaborative";
      }
      return e.departments && e.departments.toLowerCase().includes(deptFilter.toLowerCase());
    });
  }

  // Filter events by track if requested
  if (trackFilter !== "all") {
    filteredEvents = filteredEvents.filter(e => e.track_name === trackFilter);
  }

  // Date Filtering & Scope Setup
  let minTime, maxTime, totalDuration;
  let ticks = [];
  let showNowMarker = false;
  let nowLeftPct = null;

  if (ganttDatePreset === "day" && selectedGanttDate) {
    const dayStart = new Date(`${selectedGanttDate}T00:00:00`).getTime();
    const dayEnd = dayStart + (24 * 3600 * 1000);

    // Keep only events that overlap with this 24-hour day
    filteredEvents = filteredEvents.filter(e => e.start < dayEnd && e.end > dayStart);

    minTime = dayStart;
    maxTime = dayEnd;
    totalDuration = 24 * 3600 * 1000;

    // Generate exactly 13 clean 2-hour ticks across the day
    const curD = new Date(selectedGanttDate + "T00:00:00");
    const daySublabel = curD.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    for (let h = 0; h <= 24; h += 2) {
      const tickTime = dayStart + (h * 3600 * 1000);
      const leftPct = (h / 24) * 100;
      const label = `${String(h).padStart(2, '0')}:00`;
      ticks.push({ time: tickTime, leftPct, label, sublabel: daySublabel });
    }

    const nowMs = Date.now();
    if (nowMs >= minTime && nowMs <= maxTime) {
      showNowMarker = true;
      nowLeftPct = ((nowMs - minTime) / totalDuration) * 100;
    }
  } else {
    // Multi-Day Overview Mode
    if (filteredEvents.length === 0) {
      wrapper.innerHTML = `
        <div class="py-16 text-center text-slate-400">
          <p class="font-bold text-base text-slate-600">No scheduled trains or maintenance blocks found.</p>
        </div>
      `;
      return;
    }

    const allStarts = filteredEvents.map(e => e.start);
    const allEnds = filteredEvents.map(e => e.end);
    minTime = Math.min(...allStarts) - (45 * 60 * 1000);
    maxTime = Math.max(...allEnds) + (45 * 60 * 1000);
    if (maxTime - minTime < 8 * 3600 * 1000) {
      maxTime = minTime + (8 * 3600 * 1000);
    }
    totalDuration = maxTime - minTime;

    // Safe tick intervals so ticks never overlap or smear
    let tickInterval;
    if (totalDuration > 72 * 3600 * 1000) tickInterval = 12 * 3600 * 1000;
    else if (totalDuration > 36 * 3600 * 1000) tickInterval = 6 * 3600 * 1000;
    else if (totalDuration > 14 * 3600 * 1000) tickInterval = 3 * 3600 * 1000;
    else tickInterval = 2 * 3600 * 1000;

    let currentTick = Math.floor(minTime / tickInterval) * tickInterval;
    while (currentTick <= maxTime) {
      if (currentTick >= minTime) {
        const leftPct = ((currentTick - minTime) / totalDuration) * 100;
        const d = new Date(currentTick);
        const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        const dayStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
        ticks.push({ time: currentTick, leftPct, label: timeStr, sublabel: dayStr });
      }
      currentTick += tickInterval;
    }

    const nowMs = Date.now();
    if (nowMs >= minTime && nowMs <= maxTime) {
      showNowMarker = true;
      nowLeftPct = ((nowMs - minTime) / totalDuration) * 100;
    }
  }

  // Determine which tracks to render
  let displayTracks = DEFAULT_KATPADI_TRACKS;
  if (trackFilter !== "all") {
    displayTracks = [trackFilter];
  } else {
    const set = new Set(DEFAULT_KATPADI_TRACKS);
    filteredEvents.forEach(e => { if (e.track_name) set.add(e.track_name); });
    displayTracks = Array.from(set);
  }

  // Update statistics footer
  if (statsSpan) {
    const trainCount = filteredEvents.filter(e => e.type === "train").length;
    const blockCount = filteredEvents.filter(e => e.type === "block").length;
    const dayName = (ganttDatePreset === "day" && selectedGanttDate)
      ? new Date(selectedGanttDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
      : "All Dates";
    statsSpan.innerHTML = `<span class="text-blue-900 font-bold">${trainCount}</span> Trains &bull; <span class="text-purple-900 font-bold">${blockCount}</span> Blocks on <span class="text-amber-800 font-extrabold">${dayName}</span> (Katpadi Corridors)`;
  }

  // Empty state for selected date
  if (filteredEvents.length === 0) {
    const dateFormatted = selectedGanttDate 
      ? new Date(selectedGanttDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
      : "Selected Date";

    wrapper.innerHTML = `
      <div class="py-16 text-center text-slate-500">
        <p class="font-extrabold text-base text-[#0a2f5c]">No corridor events scheduled on ${dateFormatted}</p>
        <p class="text-xs text-slate-500 mt-1">Use the <strong>[◀ Prev Day]</strong> or <strong>[Next Day ▶]</strong> buttons, or choose an active schedule date from the dropdown above.</p>
        <div class="mt-4 flex items-center justify-center gap-2">
          <button type="button" onclick="setGanttDatePreset('today')" class="px-3.5 py-1.5 bg-[#0a2f5c] hover:bg-[#071d3a] text-white text-xs font-bold rounded-lg transition cursor-pointer shadow-xs active:scale-95">
            📅 View Active Schedule Date
          </button>
        </div>
      </div>
    `;
    return;
  }

  // Render Gantt Chart HTML
  let html = `
    <!-- X-AXIS TIME RULER (Top Fixed Header) -->
    <div class="flex border-b-2 border-slate-300 bg-[#071d3a] text-white sticky top-0 z-20 text-xs font-semibold select-none shadow-xs">
      
      <!-- Y-Axis Header Corner: Track Corridors -->
      <div class="w-72 shrink-0 px-4 py-3 border-r-2 border-slate-700 bg-[#0a2f5c] flex items-center justify-between">
        <div>
          <span class="uppercase tracking-wider text-[11px] font-black text-amber-400">Katpadi Track Corridor</span>
          <p class="text-[9px] text-blue-200">
            ${ganttDatePreset === "day" ? new Date(selectedGanttDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : 'Overview'}
          </p>
        </div>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-200 border border-blue-800">KPD</span>
      </div>

      <!-- X-Axis Header Time Ticks -->
      <div class="grow relative h-14 bg-[#071d3a]">
        ${ticks.map(t => `
          <div class="absolute top-0 bottom-0 flex flex-col justify-center border-l border-slate-600/70 pl-1.5 font-mono text-[10px]" style="left: ${t.leftPct}%;">
            <span class="text-white font-bold leading-tight">${t.label}</span>
            <span class="text-blue-200/70 text-[9px] leading-none">${t.sublabel}</span>
          </div>
        `).join('')}

        <!-- LIVE "NOW" MARKER PILL -->
        ${showNowMarker ? `
          <div class="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center" style="left: ${nowLeftPct}%;">
            <div class="bg-rose-600 text-white font-black text-[9px] px-1.5 py-0.2 rounded shadow-sm leading-tight uppercase animate-pulse">
              NOW
            </div>
          </div>
        ` : ''}
      </div>
    </div>

    <!-- Y-AXIS TRACK LANES -->
    <div class="divide-y divide-slate-200 bg-white relative">
  `;

  // Render each track lane
  displayTracks.forEach(track => {
    const trackEvents = filteredEvents.filter(e => e.track_name === track);

    // Multi-slot assignment so overlapping events stack vertically neatly
    trackEvents.sort((a, b) => a.start - b.start);
    const slots = [];
    trackEvents.forEach(ev => {
      let placed = false;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] <= ev.start) {
          ev.slot = i;
          slots[i] = ev.end;
          placed = true;
          break;
        }
      }
      if (!placed) {
        ev.slot = slots.length;
        slots.push(ev.end);
      }
    });

    const numSlots = Math.max(1, slots.length);
    const laneHeightPx = Math.max(numSlots * 46 + 18, 68);

    html += `
      <div class="flex hover:bg-slate-50/80 transition group">
        
        <!-- Y-AXIS: Track Label Column -->
        <div class="w-72 shrink-0 p-3.5 border-r-2 border-slate-200 bg-slate-50/60 flex flex-col justify-center group-hover:bg-slate-100/70 transition">
          <div class="font-extrabold text-xs text-slate-900 leading-snug flex items-center gap-1.5">
            <span class="text-slate-400 text-xs">🛤️</span>
            <span>${track}</span>
          </div>
          
          <div class="flex items-center gap-2 mt-1.5">
            <span class="text-[10px] text-slate-500 font-medium">Katpadi Jn</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${trackEvents.length > 0 ? 'bg-blue-100 text-blue-900 border border-blue-200' : 'bg-slate-100 text-slate-400'}">
              ${trackEvents.length} event${trackEvents.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <!-- X-AXIS: Timeline Space Canvas for this Track -->
        <div class="grow relative gantt-lane" style="height: ${laneHeightPx}px;">
          
          <!-- Vertical grid lines for each time tick -->
          ${ticks.map(t => `
            <div class="absolute top-0 bottom-0 border-l border-slate-200 pointer-events-none" style="left: ${t.leftPct}%;"></div>
          `).join('')}

          <!-- Live NOW Vertical Line -->
          ${showNowMarker ? `
            <div class="absolute top-0 bottom-0 border-l-2 border-rose-500/80 z-20 pointer-events-none" style="left: ${nowLeftPct}%;"></div>
          ` : ''}

          <!-- Event Bars -->
          ${trackEvents.map(ev => {
            const clampedStart = Math.max(minTime, ev.start);
            const clampedEnd = Math.min(maxTime, ev.end);
            const leftPct = Math.max(0, Math.min(98.5, ((clampedStart - minTime) / totalDuration) * 100));
            const widthPct = Math.max(3.0, Math.min(100 - leftPct, ((clampedEnd - clampedStart) / totalDuration) * 100));
            const topPx = ev.slot * 46 + 10;

            const isStartedPrev = ev.start < minTime;
            const isContNext = ev.end > maxTime;

            if (ev.type === "train") {
              // Train Movement Bar: Steel Slate / Railway Navy
              const trainHoverHtml = `
                <div class="space-y-1.5">
                  <div class="flex items-center justify-between gap-2 border-b border-slate-700 pb-1">
                    <span class="font-bold text-amber-400 flex items-center gap-1">🚆 Train Movement #${ev.id}</span>
                    <span class="px-2 py-0.2 rounded text-[10px] bg-slate-700 text-slate-200 font-mono">Live Timetable</span>
                  </div>
                  <div>
                    <p class="font-bold text-white text-sm">${ev.train_number} - ${ev.train_name}</p>
                    <p class="text-slate-300 text-[11px] mt-0.5">Corridor: <span class="text-white font-semibold">${ev.track_name}</span></p>
                  </div>
                  <div class="text-[11px] grid grid-cols-2 gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700 font-mono">
                    <div>
                      <span class="text-slate-400 block text-[9px] uppercase">Arrival / Entry</span>
                      <span class="text-emerald-400 font-bold">${formatDisplayDateTime(ev.raw.entry_time)}</span>
                    </div>
                    <div>
                      <span class="text-slate-400 block text-[9px] uppercase">Departure / Exit</span>
                      <span class="text-rose-400 font-bold">${formatDisplayDateTime(ev.raw.exit_time)}</span>
                    </div>
                  </div>
                  <div class="text-[10px] text-slate-400 flex items-center justify-between pt-0.5">
                    <span>Duration: <strong class="text-white font-mono">${formatDuration(ev.durationMins)}</strong></span>
                    <span class="text-amber-300">Southern Railway</span>
                  </div>
                </div>
              `;

              return `
                <div 
                  class="absolute h-9 rounded-lg bg-slate-700 hover:bg-slate-800 text-white shadow-md border-2 border-slate-800 flex items-center px-3 text-xs font-bold overflow-hidden transition-all duration-150 hover:z-30 hover:scale-[1.01] hover:ring-2 hover:ring-slate-400 cursor-pointer"
                  style="left: ${leftPct}%; width: ${widthPct}%; top: ${topPx}px;"
                  data-tooltip="${encodeURIComponent(trainHoverHtml)}"
                  onmouseenter="handleBarMouseEnter(event)"
                  onmouseleave="handleBarMouseLeave(event)"
                  title="🚆 TRAIN #${ev.train_number}: ${ev.train_name} | Track: ${ev.track_name} | Window: ${formatDisplayDateTime(ev.raw.entry_time)} - ${formatDisplayDateTime(ev.raw.exit_time)} (${ev.durationMins}m)"
                >
                  <span class="truncate flex items-center gap-1.5 leading-none">
                    ${isStartedPrev ? '<span class="text-[10px] text-amber-300 font-black">◀</span>' : '<span class="text-xs">🚆</span>'}
                    <span class="font-mono font-black text-amber-300">${ev.train_number}</span>
                    <span class="font-semibold text-slate-100 hidden sm:inline truncate">${ev.train_name}</span>
                    <span class="text-[10px] font-mono opacity-80 hidden md:inline">(${ev.durationMins}m)</span>
                    ${isContNext ? '<span class="text-[10px] text-amber-300 font-black">▶</span>' : ''}
                  </span>
                </div>
              `;
            } else {
              // Maintenance Block Bar with Department Color Differentiation
              const visuals = ev.deptVisuals;
              const isProposed = ev.status === "Algorithm_Proposed";
              const isInProgress = ev.status === "In Progress";
              const isCompleted = ev.status === "Completed";

              let borderStyle = visuals.borderClass;
              let pulseClass = "";
              let statusIcon = "🔵";

              if (isInProgress) {
                pulseClass = "ring-2 ring-amber-400 ring-offset-1 animate-pulse";
                statusIcon = "⚡";
              } else if (isCompleted) {
                statusIcon = "✅";
              } else if (isProposed) {
                borderStyle = "border-dashed border-2 border-amber-300";
                statusIcon = "🟣";
              }

              const blockHoverHtml = `
                <div class="space-y-2">
                  <div class="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5">
                    <span class="font-bold text-amber-400 flex items-center gap-1">
                      <span>🛠️ Maintenance Block #${ev.id}</span>
                    </span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${visuals.badgeClass}">
                      ${visuals.emoji} ${visuals.colorName}
                    </span>
                  </div>

                  <div>
                    <div class="text-[11px] font-bold text-white mb-0.5 flex items-center gap-1.5">
                      <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${visuals.hex};"></span>
                      <span>Department: ${ev.departments || visuals.displayName}</span>
                    </div>
                    <p class="text-slate-300 text-[11px]">Track: <span class="text-white font-semibold">${ev.track_name}</span></p>
                  </div>

                  <div class="text-[11px] grid grid-cols-2 gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700 font-mono">
                    <div>
                      <span class="text-slate-400 block text-[9px] uppercase">Start Window</span>
                      <span class="text-emerald-400 font-bold">${formatDisplayDateTime(ev.raw.start_time)}</span>
                    </div>
                    <div>
                      <span class="text-slate-400 block text-[9px] uppercase">End Window</span>
                      <span class="text-rose-400 font-bold">${formatDisplayDateTime(ev.raw.end_time)}</span>
                    </div>
                  </div>

                  <div class="flex items-center justify-between text-[11px] pt-0.5">
                    <span>Duration: <strong class="text-amber-300 font-mono font-bold">${formatDuration(ev.durationMins)}</strong></span>
                    <span>Status: <strong class="text-white">${ev.status}</strong></span>
                  </div>

                  ${ev.raw.highest_severity_text ? `
                    <div class="text-[10px] text-slate-400 border-t border-slate-700 pt-1 flex items-center justify-between">
                      <span>Severity: <strong class="text-slate-200">${ev.raw.highest_severity_text}</strong></span>
                      <span>Bundle: <strong class="text-slate-200">${ev.raw.defect_count || 1} defect(s)</strong></span>
                    </div>
                  ` : ''}
                </div>
              `;

              return `
                <div 
                  class="absolute h-9 rounded-lg ${visuals.bgClass} ${visuals.hoverBgClass} text-white shadow-md border-2 ${borderStyle} ${pulseClass} flex items-center px-3 text-xs font-bold overflow-hidden transition-all duration-150 hover:z-30 hover:scale-[1.01] hover:ring-2 hover:ring-white cursor-pointer"
                  style="left: ${leftPct}%; width: ${widthPct}%; top: ${topPx}px;"
                  data-tooltip="${encodeURIComponent(blockHoverHtml)}"
                  onmouseenter="handleBarMouseEnter(event)"
                  onmouseleave="handleBarMouseLeave(event)"
                  title="🛠️ BLOCK #${ev.id} [${visuals.department}] | Track: ${ev.track_name} | Duration: ${ev.durationMins} mins | Window: ${formatDisplayDateTime(ev.raw.start_time)} - ${formatDisplayDateTime(ev.raw.end_time)}"
                >
                  <span class="truncate flex items-center gap-1.5 leading-none">
                    ${isStartedPrev ? '<span class="text-[10px] text-amber-300 font-black">◀</span>' : `<span class="text-xs">${statusIcon}</span>`}
                    <span class="font-mono font-black">Block #${ev.id}</span>
                    <span class="font-bold text-[11px] opacity-95 hidden sm:inline truncate">[${visuals.tagLabel}]</span>
                    <span class="text-[10px] font-mono opacity-85 hidden md:inline">(${ev.durationMins}m)</span>
                    ${isContNext ? '<span class="text-[10px] text-amber-300 font-black">▶</span>' : ''}
                  </span>
                </div>
              `;
            }
          }).join('')}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  wrapper.innerHTML = html;
}
window.renderGanttChart = renderGanttChart;


// =========================================================
// 10. DEDICATED APPROVED MAINTENANCE BLOCKS GANTT CHART
// =========================================================

/**
 * Renders the dedicated Gantt Chart view specifically for Approved Maintenance Blocks
 * in Section 4 of the Station Master Dashboard.
 * Synchronized with the active date selector.
 */
function renderApprovedBlocksGantt() {
  const wrapper = document.getElementById("approvedBlocksGanttWrapper");
  if (!wrapper) return;

  if (!selectedGanttDate) {
    selectedGanttDate = getInitialScheduleDate();
  }
  updateDateControlUI();

  let activeBlocks = (ganttApprovedBlocks || []).filter(b => 
    ["Approved", "In Progress", "Completed"].includes(b.block_status)
  );

  let minTime, maxTime, totalDuration;
  let ticks = [];

  if (ganttDatePreset === "day" && selectedGanttDate) {
    const dayStart = new Date(`${selectedGanttDate}T00:00:00`).getTime();
    const dayEnd = dayStart + (24 * 3600 * 1000);

    // Filter to blocks overlapping this day
    activeBlocks = activeBlocks.filter(b => {
      const s = new Date(b.start_time).getTime();
      const e = new Date(b.end_time).getTime();
      return s < dayEnd && e > dayStart;
    });

    minTime = dayStart;
    maxTime = dayEnd;
    totalDuration = 24 * 3600 * 1000;

    const curD = new Date(selectedGanttDate + "T00:00:00");
    const daySublabel = curD.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    for (let h = 0; h <= 24; h += 2) {
      const tickTime = dayStart + (h * 3600 * 1000);
      const leftPct = (h / 24) * 100;
      const label = `${String(h).padStart(2, '0')}:00`;
      ticks.push({ time: tickTime, leftPct, label, sublabel: daySublabel });
    }
  } else {
    // Multi-Day Overview Mode
    if (activeBlocks.length === 0) {
      wrapper.innerHTML = `
        <div class="py-14 text-center text-slate-400">
          <p class="font-bold text-base text-slate-600">No approved maintenance blocks found in corridor schedule.</p>
        </div>
      `;
      return;
    }

    const allStarts = activeBlocks.map(b => new Date(b.start_time).getTime()).filter(t => !isNaN(t));
    const allEnds = activeBlocks.map(b => new Date(b.end_time).getTime()).filter(t => !isNaN(t));
    minTime = Math.min(...allStarts) - (45 * 60 * 1000);
    maxTime = Math.max(...allEnds) + (45 * 60 * 1000);
    if (maxTime - minTime < 8 * 3600 * 1000) {
      maxTime = minTime + (8 * 3600 * 1000);
    }
    totalDuration = maxTime - minTime;

    let tickInterval;
    if (totalDuration > 72 * 3600 * 1000) tickInterval = 12 * 3600 * 1000;
    else if (totalDuration > 36 * 3600 * 1000) tickInterval = 6 * 3600 * 1000;
    else if (totalDuration > 14 * 3600 * 1000) tickInterval = 3 * 3600 * 1000;
    else tickInterval = 2 * 3600 * 1000;

    let currentTick = Math.floor(minTime / tickInterval) * tickInterval;
    while (currentTick <= maxTime) {
      if (currentTick >= minTime) {
        const leftPct = ((currentTick - minTime) / totalDuration) * 100;
        const d = new Date(currentTick);
        const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
        const dayStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
        ticks.push({ time: currentTick, leftPct, label: timeStr, sublabel: dayStr });
      }
      currentTick += tickInterval;
    }
  }

  if (activeBlocks.length === 0) {
    const dateFormatted = selectedGanttDate 
      ? new Date(selectedGanttDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })
      : "Selected Date";

    wrapper.innerHTML = `
      <div class="py-14 text-center text-slate-500">
        <p class="font-bold text-base text-[#0a2f5c]">No approved maintenance blocks scheduled on ${dateFormatted}</p>
        <p class="text-xs text-slate-400 mt-1">Use the <strong>[◀]</strong> or <strong>[▶]</strong> buttons above to navigate through schedule days.</p>
      </div>
    `;
    return;
  }

  // Collect active tracks
  const setTracks = new Set(DEFAULT_KATPADI_TRACKS);
  activeBlocks.forEach(b => { if (b.track_name) setTracks.add(b.track_name); });
  const displayTracks = Array.from(setTracks);

  let html = `
    <!-- X-AXIS TIME RULER -->
    <div class="flex border-b-2 border-slate-300 bg-[#0a2f5c] text-white sticky top-0 z-20 text-xs font-semibold select-none shadow-xs">
      <div class="w-72 shrink-0 px-4 py-3 border-r-2 border-slate-700 bg-[#071d3a] flex items-center justify-between">
        <span class="uppercase tracking-wider text-[11px] font-black text-amber-400">Katpadi Track (Y-Axis)</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-950 text-blue-200">KPD</span>
      </div>
      <div class="grow relative h-14 bg-[#0a2f5c]">
        ${ticks.map(t => `
          <div class="absolute top-0 bottom-0 flex flex-col justify-center border-l border-slate-600/70 pl-1.5 font-mono text-[10px]" style="left: ${t.leftPct}%;">
            <span class="text-white font-bold leading-tight">${t.label}</span>
            <span class="text-blue-200/70 text-[9px] leading-none">${t.sublabel}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Y-AXIS TRACK LANES -->
    <div class="divide-y divide-slate-200 bg-white">
  `;

  displayTracks.forEach(track => {
    const trackBlocks = activeBlocks.filter(b => b.track_name === track);

    // Multi-slot assignment
    trackBlocks.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const slots = [];
    trackBlocks.forEach(b => {
      const s = new Date(b.start_time).getTime();
      const e = new Date(b.end_time).getTime();
      let placed = false;
      for (let i = 0; i < slots.length; i++) {
        if (slots[i] <= s) {
          b.slot = i;
          slots[i] = e;
          placed = true;
          break;
        }
      }
      if (!placed) {
        b.slot = slots.length;
        slots.push(e);
      }
    });

    const numSlots = Math.max(1, slots.length);
    const laneHeightPx = Math.max(numSlots * 46 + 18, 68);

    html += `
      <div class="flex hover:bg-slate-50/80 transition group">
        <!-- Track Label Column (Y-Axis) -->
        <div class="w-72 shrink-0 p-3.5 border-r-2 border-slate-200 bg-slate-50/60 flex flex-col justify-center group-hover:bg-slate-100/70 transition">
          <div class="font-extrabold text-xs text-slate-900 leading-snug flex items-center gap-1.5">
            <span class="text-slate-400 text-xs">🛤️</span>
            <span>${track}</span>
          </div>
          <div class="flex items-center gap-2 mt-1.5">
            <span class="text-[10px] text-slate-500 font-medium">Katpadi Jn</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${trackBlocks.length > 0 ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-slate-100 text-slate-400'}">
              ${trackBlocks.length} approved block${trackBlocks.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <!-- Timeline Canvas Lane (X-Axis) -->
        <div class="grow relative gantt-lane" style="height: ${laneHeightPx}px;">
          ${ticks.map(t => `
            <div class="absolute top-0 bottom-0 border-l border-slate-200 pointer-events-none" style="left: ${t.leftPct}%;"></div>
          `).join('')}

          ${trackBlocks.map(b => {
            const s = new Date(b.start_time).getTime();
            const e = new Date(b.end_time).getTime();
            const clampedStart = Math.max(minTime, s);
            const clampedEnd = Math.min(maxTime, e);
            const leftPct = Math.max(0, Math.min(98.5, ((clampedStart - minTime) / totalDuration) * 100));
            const widthPct = Math.max(3.0, Math.min(100 - leftPct, ((clampedEnd - clampedStart) / totalDuration) * 100));
            const topPx = b.slot * 46 + 10;

            const isStartedPrev = s < minTime;
            const isContNext = e > maxTime;

            const visuals = getDepartmentVisuals(b.departments, b.is_collaborative, b.dept_count);
            const isInProgress = b.block_status === "In Progress";
            const pulseClass = isInProgress ? "ring-2 ring-amber-400 ring-offset-1 animate-pulse" : "";
            const statusIcon = isInProgress ? "⚡" : (b.block_status === "Completed" ? "✅" : "🔵");

            const blockHoverHtml = `
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2 border-b border-slate-700 pb-1.5">
                  <span class="font-bold text-amber-400">Approved Block #${b.blockid}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${visuals.badgeClass}">
                    ${visuals.emoji} ${visuals.colorName}
                  </span>
                </div>
                <div>
                  <div class="text-[11px] font-bold text-white mb-0.5">Department: ${b.departments}</div>
                  <p class="text-slate-300 text-[11px]">Track: <span class="text-white font-semibold">${b.track_name}</span></p>
                </div>
                <div class="text-[11px] grid grid-cols-2 gap-2 bg-slate-800/80 p-2 rounded-lg border border-slate-700 font-mono">
                  <div>
                    <span class="text-slate-400 block text-[9px] uppercase">Start Window</span>
                    <span class="text-emerald-400 font-bold">${formatDisplayDateTime(b.start_time)}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block text-[9px] uppercase">End Window</span>
                    <span class="text-rose-400 font-bold">${formatDisplayDateTime(b.end_time)}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between text-[11px] pt-0.5">
                  <span>Duration: <strong class="text-amber-300 font-mono font-bold">${formatDuration(b.duration_minutes)}</strong></span>
                  <span>Status: <strong class="text-white">${b.block_status}</strong></span>
                </div>
              </div>
            `;

            return `
              <div 
                class="absolute h-9 rounded-lg ${visuals.bgClass} ${visuals.hoverBgClass} text-white shadow-md border-2 ${visuals.borderClass} ${pulseClass} flex items-center px-3 text-xs font-bold overflow-hidden transition-all duration-150 hover:z-30 hover:scale-[1.01] hover:ring-2 hover:ring-white cursor-pointer"
                style="left: ${leftPct}%; width: ${widthPct}%; top: ${topPx}px;"
                data-tooltip="${encodeURIComponent(blockHoverHtml)}"
                onmouseenter="handleBarMouseEnter(event)"
                onmouseleave="handleBarMouseLeave(event)"
                title="🛠️ APPROVED BLOCK #${b.blockid} | Dept: ${visuals.department} | Track: ${b.track_name} | Duration: ${b.duration_minutes}m"
              >
                <span class="truncate flex items-center gap-1.5 leading-none">
                  ${isStartedPrev ? '<span class="text-[10px] text-amber-300 font-black">◀</span>' : `<span class="text-xs">${statusIcon}</span>`}
                  <span class="font-mono font-black">Block #${b.blockid}</span>
                  <span class="font-bold text-[11px] opacity-95 hidden sm:inline truncate">[${visuals.tagLabel}]</span>
                  <span class="text-[10px] font-mono opacity-85 hidden md:inline">(${b.duration_minutes}m)</span>
                  ${isContNext ? '<span class="text-[10px] text-amber-300 font-black">▶</span>' : ''}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  wrapper.innerHTML = html;
}
window.renderApprovedBlocksGantt = renderApprovedBlocksGantt;

function handleBarMouseEnter(e) {
  const encoded = e.currentTarget.getAttribute("data-tooltip");
  if (!encoded) return;
  const decodedHtml = decodeURIComponent(encoded);
  showGanttTooltip(e.clientX, e.clientY, decodedHtml);
}
window.handleBarMouseEnter = handleBarMouseEnter;

function handleBarMouseLeave(e) {
  hideGanttTooltip();
}
window.handleBarMouseLeave = handleBarMouseLeave;
