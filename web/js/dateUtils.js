/**
 * תאריכים והשוואות יום — ללא תלות ב-DOM או ב-XLSX.
 */

/** Excel 1900 date serial → Date (מקומי) */
export function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + Math.round(n * 86400000);
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function toDate(v) {
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

export function toBalance(v) {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").replace(/\s/g, "").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function cmpDay(a, b) {
  const ta = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const tb = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return ta - tb;
}

export function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthsBetween(firstDay, lastDay) {
  const start = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1);
  const end = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
  const out = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push({ y: d.getFullYear(), m: d.getMonth() + 1 });
  }
  return out;
}

export function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * @param {number|'last'} dayInMonth
 */
export function snapshotDate(year, month, dayInMonth) {
  if (dayInMonth === "last") {
    const ld = lastDayOfMonth(year, month);
    return new Date(year, month - 1, ld);
  }
  const cap = lastDayOfMonth(year, month);
  const d = Math.min(dayInMonth, cap);
  return new Date(year, month - 1, d);
}
