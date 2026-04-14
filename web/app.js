/**
 * לוגיקה מקבילה ל-bank_balance_chart.py — ריצה מלאה בדפדפן.
 */

function normalizeHeader(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Excel 1900 date serial → Date (מקומי) */
function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(n * 86400000);
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function toDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === "number") return excelSerialToDate(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return null;
}

function toBalance(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function findColIndices(headerRow) {
  let dateIdx = -1;
  let balIdx = -1;
  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i]);
    if (h === "תאריך") dateIdx = i;
    if (h.includes("יתרה")) balIdx = i;
  }
  return { dateIdx, balIdx };
}

function monthsBetween(firstDay, lastDay) {
  const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
  const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const out = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  return out;
}

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function snapshotDate(year, month, dayInMonth) {
  if (dayInMonth === "last") {
    const ld = lastDayOfMonth(year, month);
    return new Date(year, month - 1, ld);
  }
  const cap = lastDayOfMonth(year, month);
  const d = Math.min(dayInMonth, cap);
  return new Date(year, month - 1, d);
}

function cmpDay(a, b) {
  const ta = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const tb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return ta - tb;
}

/**
 * @param {ArrayBuffer} ab
 */
function parseBankXlsx(ab) {
  const wb = XLSX.read(ab, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  if (!rows || rows.length < 6) return { error: "הקובץ קצר מדי או ריק." };

  const headerRow = rows[4];
  const { dateIdx, balIdx } = findColIndices(headerRow);
  if (dateIdx < 0 || balIdx < 0) {
    return { error: "לא נמצאו עמודות תאריך / יתרה (שורת כותרות צפויה בשורה 5)." };
  }

  const raw = [];
  for (let r = 5; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const day = toDate(row[dateIdx]);
    const balance = toBalance(row[balIdx]);
    if (!day || Number.isNaN(balance)) continue;
    raw.push({ day, balance, _ord: raw.length });
  }

  if (raw.length === 0) return { error: "אין שורות עם תאריך ויתרה תקינים." };

  raw.sort((a, b) => {
    const c = cmpDay(a.day, b.day);
    if (c !== 0) return c;
    return a._ord - b._ord;
  });

  const byDay = new Map();
  for (const row of raw) {
    const key = row.day.getTime();
    if (!byDay.has(key)) byDay.set(key, row.balance);
  }

  const daily = Array.from(byDay.entries())
    .map(([t, balance]) => ({ day: new Date(Number(t)), balance }))
    .sort((a, b) => cmpDay(a.day, b.day));

  const minDay = daily[0].day;
  const maxDay = daily[daily.length - 1].day;
  return { daily, minDay, maxDay };
}

/**
 * @param {{ day: Date, balance: number }[]} daily
 * @param {number|'last'} dayInMonth
 */
function monthlySnapshots(daily, dayInMonth) {
  if (!daily.length) return [];

  const first = daily[0].day;
  const lastDataDay = daily[daily.length - 1].day;
  const months = monthsBetween(first, lastDataDay);
  const rows = [];

  for (const { y, m } of months) {
    const snap = snapshotDate(y, m, dayInMonth);
    if (cmpDay(snap, lastDataDay) > 0) {
      rows.push({ snapshot: snap, balance: NaN });
      continue;
    }
    let bal = NaN;
    for (let i = 0; i < daily.length; i++) {
      if (cmpDay(daily[i].day, snap) <= 0) bal = daily[i].balance;
    }
    if (Number.isNaN(bal)) rows.push({ snapshot: snap, balance: NaN });
    else rows.push({ snapshot: snap, balance: bal });
  }

  let lastOk = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!Number.isNaN(rows[i].balance)) {
      lastOk = i;
      break;
    }
  }
  if (lastOk < 0) return [];
  return rows.slice(0, lastOk + 1);
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderChart(snapRows) {
  const xs = snapRows.map((r) => fmtDate(r.snapshot));
  const ys = snapRows.map((r) => r.balance);
  const trace = {
    x: xs,
    y: ys,
    mode: "lines+markers",
    name: "יתרה",
    connectgaps: false,
    hovertemplate: "%{x}<br>יתרה: %{y:,.2f} ₪<extra></extra>",
  };
  Plotly.react(
    "chart",
    [trace],
    {
      autosize: true,
      height: 520,
      margin: { l: 50, r: 40, t: 40, b: 50 },
      xaxis: { title: "תאריך צילום (סוף יום)", tickformat: "%Y-%m-%d" },
      yaxis: { title: "יתרה (₪)", tickformat: ",.0f" },
      hovermode: "x unified",
      font: { family: "system-ui, Arial, sans-serif" },
    },
    { responsive: true, locale: "he" }
  );
}

function renderTable(snapRows) {
  const tbody = document.querySelector("#points-body");
  tbody.innerHTML = "";
  for (const r of snapRows) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = fmtDate(r.snapshot);
    const td2 = document.createElement("td");
    td2.textContent = Number.isNaN(r.balance) ? "—" : r.balance.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
}

let lastBuffer = null;

function run() {
  const errEl = document.getElementById("error");
  const chartEl = document.getElementById("chart");
  errEl.textContent = "";
  errEl.style.display = "none";

  if (!lastBuffer) {
    chartEl.innerHTML =
      '<p style="color:#8b9cb3;text-align:center;padding:2rem 1rem;margin:0">העלו קובץ Excel (.xlsx) להצגת הגרף.</p>';
    document.getElementById("min-tx").textContent = "—";
    document.getElementById("max-tx").textContent = "—";
    document.querySelector("#points-body").innerHTML = "";
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
  document.getElementById("min-tx").textContent = fmtDate(minDay);
  document.getElementById("max-tx").textContent = fmtDate(maxDay);

  const mode = document.querySelector('input[name="snap-mode"]:checked').value;
  const dayArg = mode === "last" ? "last" : parseInt(document.getElementById("day-num").value, 10) || 1;

  const snapRows = monthlySnapshots(daily, dayArg);
  if (snapRows.length === 0) {
    errEl.textContent = "אין נתונים להצגה.";
    errEl.style.display = "block";
    Plotly.purge("chart");
    document.querySelector("#points-body").innerHTML = "";
    return;
  }

  renderChart(snapRows);
  renderTable(snapRows);
}

function syncDayNumDisabled() {
  const last = document.querySelector('input[name="snap-mode"][value="last"]').checked;
  document.getElementById("day-num").disabled = last;
}

function wire() {
  const file = document.getElementById("file");
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

  document.querySelectorAll('input[name="snap-mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      syncDayNumDisabled();
      run();
    });
  });
  syncDayNumDisabled();
  document.getElementById("day-num").addEventListener("input", run);
  document.getElementById("day-num").addEventListener("change", run);
}

window.addEventListener("DOMContentLoaded", wire);
