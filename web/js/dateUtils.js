/**
 * תאריכים והשוואות יום — ללא תלות ב-DOM או ב-XLSX.
 */

/**
 * Excel 1900 date serial → "יום קלנדרי" מקומי (חצות באותו יום — בלי הזזת אזור זמן).
 * משתמשים ב־UTC של הסריאל כדי שלא ייפול 11 במקום 12.
 */
export function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const whole = Math.floor(n);
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + whole * 86400000;
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function toDate(v) {
  if (v == null || v === "") return null;
  /** סריאל מספרי קודם — זה מה שמגיע מ־Excel כש־cellDates: false */
  if (typeof v === "number") return excelSerialToDate(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    /** SheetJS לפעמים מחזיר Date ב־UTC חצות — ניקח יום לפי UTC ואז נבנה תאריך מקומי באותו יום קלנדרי */
    return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  }
  const s = String(v).trim();
  /** CSV לפעמים מייצא סריאל Excel כמחרוזת */
  const maybeSerial = Number(s);
  if (
    s.length > 0 &&
    Number.isFinite(maybeSerial) &&
    /^-?\d+(\.\d+)?$/.test(s) &&
    maybeSerial >= 30000 &&
    maybeSerial <= 60000
  ) {
    return excelSerialToDate(maybeSerial);
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  }
  /** 12/04/2026 */
  const dmySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmySlash) {
    const dd = parseInt(dmySlash[1], 10);
    const mm = parseInt(dmySlash[2], 10);
    const yy = parseInt(dmySlash[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return new Date(yy, mm - 1, dd);
    }
  }
  /** פורמט בנקים ישראלי נפוץ: 12.04.2026 */
  const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dmy) {
    const dd = parseInt(dmy[1], 10);
    const mm = parseInt(dmy[2], 10);
    const yy = parseInt(dmy[3], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return new Date(yy, mm - 1, dd);
    }
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
