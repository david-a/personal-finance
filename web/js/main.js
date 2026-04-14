/**
 * נקודת כניסה — חיווט DOM וזרימת נתונים
 */

import { fmtDate } from "./dateUtils.js";
import { parseBankXlsx } from "./parseXlsx.js";
import { monthlySnapshots } from "./snapshots.js";
import { destroyChart, renderChart, renderTable } from "./views.js";

const EMPTY_CHART_HTML =
  '<p style="color:#8b9cb3;text-align:center;padding:2rem 1rem;margin:0">העלו קובץ Excel (.xlsx) להצגת הגרף.</p>';

let lastBuffer = null;

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

  if (!lastBuffer) {
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
    parsed = parseBankXlsx(lastBuffer);
  } catch (e) {
    errEl.textContent = "שגיאה בקריאת הקובץ: " + (e && e.message ? e.message : String(e));
    errEl.style.display = "block";
    return;
  }
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
        lastBuffer = null;
        run();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        lastBuffer = reader.result;
        run();
      };
      reader.readAsArrayBuffer(f);
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
}

document.addEventListener("DOMContentLoaded", wire);
