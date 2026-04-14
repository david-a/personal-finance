/**
 * קריאת ייצוא בנק מ-Excel (SheetJS) או CSV (Papa Parse).
 */

import { cmpDay, toBalance, toDate } from "./dateUtils.js";

function normalizeHeader(s) {
  return String(s ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * מזהה עמודת תנועה (לא תאריך ערך).
 */
function findColIndices(headerRow) {
  let dateIdx = -1;
  let balIdx = -1;
  if (!headerRow || !headerRow.length) return { dateIdx, balIdx };

  for (let i = 0; i < headerRow.length; i++) {
    const h = normalizeHeader(headerRow[i]);
    if (!h) continue;
    if (dateIdx < 0) {
      if (h === "תאריך" || h === "תאריך הפעולה") dateIdx = i;
    }
    if (balIdx < 0 && h.includes("יתרה")) balIdx = i;
  }
  if (dateIdx < 0) {
    for (let i = 0; i < headerRow.length; i++) {
      const h = normalizeHeader(headerRow[i]);
      if (h.includes("תאריך") && !h.includes("ערך")) {
        dateIdx = i;
        break;
      }
    }
  }
  return { dateIdx, balIdx };
}

/** סורק את השורות הראשונות ומחזיר אינדקס שורת כותרות (ייצוא בנק משתנה בין פרטי/עסקי). */
function findHeaderRowIndex(rows, maxScan = 45) {
  const limit = Math.min(maxScan, rows.length);
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const { dateIdx, balIdx } = findColIndices(row);
    if (dateIdx >= 0 && balIdx >= 0) return r;
  }
  return -1;
}

/**
 * @param {(string|number|null|undefined)[][]} rows
 * @returns {{ daily: { day: Date, balance: number }[], minDay: Date, maxDay: Date } | { error: string }}
 */
function buildDailyFromSheetRows(rows) {
  if (!rows || rows.length < 2) return { error: "הקובץ קצר מדי או ריק." };

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx < 0) {
    return {
      error:
        "לא נמצאו עמודות «תאריך» ו«יתרה» בשורות הפתיחה של הגיליון. ודאו שזה ייצוא תנועות מהבנק (לא דוח אחר).",
    };
  }

  const headerRow = rows[headerIdx];
  const { dateIdx, balIdx } = findColIndices(headerRow);

  const raw = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
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
 * @param {ArrayBuffer} ab
 */
export function parseBankXlsx(ab) {
  const XLSX = globalThis.XLSX;
  if (!XLSX || typeof XLSX.read !== "function") {
    return { error: "ספריית XLSX לא נטענה." };
  }

  /** false → תאריכים כסריאל מספרי; נמנעים מ־Date של SheetJS שמזיז יום באזורי זמן */
  const wb = XLSX.read(ab, { type: "array", cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  return buildDailyFromSheetRows(rows);
}

/**
 * @param {string} text
 */
function parseBankCsvText(text) {
  const Papa = globalThis.Papa;
  if (!Papa || typeof Papa.parse !== "function") {
    return { error: "ספריית Papa Parse לא נטענה." };
  }

  const parsed = Papa.parse(text, {
    delimiter: "",
    skipEmptyLines: false,
  });

  const rows = (parsed.data || []).map((row) =>
    (row || []).map((cell) => (cell == null || cell === "" ? "" : String(cell)))
  );

  return buildDailyFromSheetRows(rows);
}

/**
 * @param {{ kind: 'xlsx', data: ArrayBuffer } | { kind: 'csv', data: string }}
 */
export function parseBankInput(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "אין קובץ." };
  }
  if (payload.kind === "csv") {
    return parseBankCsvText(payload.data);
  }
  if (payload.kind === "xlsx") {
    return parseBankXlsx(payload.data);
  }
  return { error: "סוג קובץ לא נתמך." };
}
