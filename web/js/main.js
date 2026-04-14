/**
 * נקודת כניסה — חיווט DOM וזרימת נתונים
 */

import { fmtDate } from "./dateUtils.js";
import { parseBankInput } from "./parseXlsx.js";
import { monthlySnapshots } from "./snapshots.js";
import { destroyChart, renderChart, renderTable } from "./views.js";

const EMPTY_CHART_HTML =
  '<p style="color:#8b9cb3;text-align:center;padding:2rem 1rem;margin:0">העלו קובץ Excel (.xlsx) או CSV (.csv) להצגת הגרף.</p>';

/** @type {{ kind: 'xlsx', data: ArrayBuffer } | { kind: 'csv', data: string } | null} */
let lastPayload = null;

/** @type {{ headerIdx?: number, dateIdx?: number, balIdx?: number } | null} */
let lastMapping = null;

let lastAnalysis = null;

function isCsvFile(f) {
  if (!f || !f.name) return false;
  const n = f.name.toLowerCase();
  const t = (f.type || "").toLowerCase();
  return n.endsWith(".csv") || t === "text/csv" || t === "application/csv" || t === "text/plain";
}

function el(id) {
  return document.getElementById(id);
}

function setOptions(selectEl, opts, selected) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  for (const o of opts) {
    const op = document.createElement("option");
    op.value = String(o.value);
    op.textContent = o.label;
    selectEl.appendChild(op);
  }
  if (selected != null) selectEl.value = String(selected);
}

function ensureMappingPanel(analysis, preferredMapping, forceOpen) {
  const panel = el("mapping-panel");
  if (!panel) return;

  if (!analysis || !analysis.candidates || analysis.candidates.length === 0) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";
  if (forceOpen) panel.open = true;

  const headerSel = el("map-header-row");
  const dateSel = el("map-date-col");
  const balSel = el("map-bal-col");
  const hintEl = el("map-hint");

  const candidates = analysis.candidates;
  const headerOpts = candidates.map((c) => {
    const preview = (c.headers || [])
      .filter((h) => h)
      .slice(0, 6)
      .join(" | ");
    return {
      value: c.rowIndex,
      label: `שורה ${c.rowIndex + 1}${preview ? ": " + preview : ""}`,
    };
  });

  const chosenHeaderIdx =
    preferredMapping && Number.isFinite(preferredMapping.headerIdx)
      ? Number(preferredMapping.headerIdx)
      : candidates[0].rowIndex;

  setOptions(headerSel, headerOpts, chosenHeaderIdx);

  const current = candidates.find((c) => c.rowIndex === Number(headerSel.value)) || candidates[0];
  const colOpts = (current.headers || []).map((h, i) => ({
    value: i,
    label: `${i + 1}. ${h || "(ריק)"}`,
  }));

  const dateIdx =
    preferredMapping && Number.isFinite(preferredMapping.dateIdx) ? Number(preferredMapping.dateIdx) : current.dateIdx;
  const balIdx =
    preferredMapping && Number.isFinite(preferredMapping.balIdx) ? Number(preferredMapping.balIdx) : current.balIdx;

  setOptions(dateSel, colOpts, dateIdx >= 0 ? dateIdx : 0);
  setOptions(balSel, colOpts, balIdx >= 0 ? balIdx : 0);

  if (hintEl) {
    const dName = current.headers?.[Number(dateSel.value)] || "";
    const bName = current.headers?.[Number(balSel.value)] || "";
    hintEl.textContent = `בחירה נוכחית: תאריך = «${dName || "—"}», יתרה = «${bName || "—"}».`;
  }

  // שינוי שורת כותרות → רענון עמודות, בלי להריץ מחדש (החלה רק בלחיצה)
  if (headerSel && !headerSel._wired) {
    headerSel._wired = true;
    headerSel.addEventListener("change", () => {
      if (!lastAnalysis) return;
      ensureMappingPanel(lastAnalysis, { headerIdx: Number(headerSel.value) }, true);
    });
  }

  if (dateSel && !dateSel._wired) {
    dateSel._wired = true;
    dateSel.addEventListener("change", () => {
      if (!hintEl) return;
      const cur = candidates.find((c) => c.rowIndex === Number(headerSel.value)) || candidates[0];
      const dName = cur.headers?.[Number(dateSel.value)] || "";
      const bName = cur.headers?.[Number(balSel.value)] || "";
      hintEl.textContent = `בחירה נוכחית: תאריך = «${dName || "—"}», יתרה = «${bName || "—"}».`;
    });
  }
  if (balSel && !balSel._wired) {
    balSel._wired = true;
    balSel.addEventListener("change", () => {
      if (!hintEl) return;
      const cur = candidates.find((c) => c.rowIndex === Number(headerSel.value)) || candidates[0];
      const dName = cur.headers?.[Number(dateSel.value)] || "";
      const bName = cur.headers?.[Number(balSel.value)] || "";
      hintEl.textContent = `בחירה נוכחית: תאריך = «${dName || "—"}», יתרה = «${bName || "—"}».`;
    });
  }
}

function syncDayNumDisabled() {
  const last = document.querySelector('input[name="snap-mode"][value="last"]').checked;
  const dayNum = document.getElementById("day-num");
  if (dayNum) dayNum.disabled = last;
}

function run() {
  const errEl = document.getElementById("error");
  const chartEl = document.getElementById("chart");
  if (!errEl || !chartEl) return;

  errEl.textContent = "";
  errEl.style.display = "none";

  if (!lastPayload) {
    destroyChart();
    chartEl.innerHTML = EMPTY_CHART_HTML;
    const minTx = document.getElementById("min-tx");
    const maxTx = document.getElementById("max-tx");
    if (minTx) minTx.textContent = "—";
    if (maxTx) maxTx.textContent = "—";
    const tbody = document.querySelector("#points-body");
    if (tbody) tbody.innerHTML = "";
    return;
  }

  let parsed;
  try {
    parsed = parseBankInput(lastPayload, lastMapping);
  } catch (e) {
    errEl.textContent = "שגיאה בקריאת הקובץ: " + (e && e.message ? e.message : String(e));
    errEl.style.display = "block";
    return;
  }

  lastAnalysis = parsed && parsed.analysis ? parsed.analysis : null;
  ensureMappingPanel(lastAnalysis, lastMapping, Boolean(parsed && parsed.needsMapping));

  if (parsed.error) {
    errEl.textContent = parsed.error;
    errEl.style.display = "block";
    return;
  }

  const { daily, minDay, maxDay } = parsed;
  const minEl = document.getElementById("min-tx");
  const maxEl = document.getElementById("max-tx");
  if (minEl) minEl.textContent = fmtDate(minDay);
  if (maxEl) maxEl.textContent = fmtDate(maxDay);

  const modeEl = document.querySelector('input[name="snap-mode"]:checked');
  const mode = modeEl ? modeEl.value : "day";
  const dayArg = mode === "last" ? "last" : parseInt(document.getElementById("day-num")?.value ?? "1", 10) || 1;

  const snapRows = monthlySnapshots(daily, dayArg);
  if (snapRows.length === 0) {
    errEl.textContent = "אין נתונים להצגה.";
    errEl.style.display = "block";
    destroyChart();
    const tbody = document.querySelector("#points-body");
    if (tbody) tbody.innerHTML = "";
    return;
  }

  renderChart(snapRows);
  renderTable(snapRows);
}

function wire() {
  const file = document.getElementById("file");
  if (file) {
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) {
        lastPayload = null;
        lastMapping = null;
        lastAnalysis = null;
        run();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (isCsvFile(f)) {
          lastPayload = { kind: "csv", data: reader.result };
        } else {
          lastPayload = { kind: "xlsx", data: reader.result };
        }
        lastMapping = null;
        run();
      };
      reader.onerror = () => {
        lastPayload = null;
        lastMapping = null;
        lastAnalysis = null;
        const errEl = document.getElementById("error");
        if (errEl) {
          errEl.textContent = "שגיאה בקריאת הקובץ מהדיסק.";
          errEl.style.display = "block";
        }
      };
      if (isCsvFile(f)) {
        reader.readAsText(f, "UTF-8");
      } else {
        reader.readAsArrayBuffer(f);
      }
    });
  }

  document.querySelectorAll('input[name="snap-mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      syncDayNumDisabled();
      run();
    });
  });
  syncDayNumDisabled();

  const dayNum = document.getElementById("day-num");
  if (dayNum) {
    dayNum.addEventListener("input", run);
    dayNum.addEventListener("change", run);
  }

  const applyBtn = el("map-apply");
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const headerSel = el("map-header-row");
      const dateSel = el("map-date-col");
      const balSel = el("map-bal-col");
      if (!headerSel || !dateSel || !balSel) return;
      lastMapping = {
        headerIdx: Number(headerSel.value),
        dateIdx: Number(dateSel.value),
        balIdx: Number(balSel.value),
      };
      run();
    });
  }
}

document.addEventListener("DOMContentLoaded", wire);
