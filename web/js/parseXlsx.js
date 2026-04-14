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

function countNonEmpty(row) {
  if (!row || !row.length) return 0;
  let n = 0;
  for (const c of row) {
    const s = normalizeHeader(c);
    if (s) n++;
  }
  return n;
}

/**
 * מחזיר מועמדים לשורת כותרות + מיפוי עמודות אפשרי.
 * @param {(string|number|null|undefined)[][]} rows
 * @returns {{
 *  candidates: { rowIndex: number, headers: string[], dateIdx: number, balIdx: number, score: number }[],
 *  best?: { rowIndex: number, headers: string[], dateIdx: number, balIdx: number, score: number }
 * }}
 */
function analyzeRowsForMapping(rows) {
  const limit = Math.min(45, rows.length);
  /** @type {{ rowIndex: number, headers: string[], dateIdx: number, balIdx: number, score: number }[]} */
  const candidates = [];
  for (let r = 0; r < limit; r++) {
    const row = rows[r];
    if (!row) continue;
    const nonEmpty = countNonEmpty(row);
    if (nonEmpty < 2) continue;
    const headers = row.map(normalizeHeader);
    const { dateIdx, balIdx } = findColIndices(row);
    const score =
      (dateIdx >= 0 ? 30 : 0) + (balIdx >= 0 ? 30 : 0) + Math.min(nonEmpty, 20) - r * 0.15;
    candidates.push({ rowIndex: r, headers, dateIdx, balIdx, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates.length ? candidates[0] : undefined;
  return { candidates: candidates.slice(0, 10), best };
}

/**
 * @param {(string|number|null|undefined)[][]} rows
 * @param {{ headerIdx?: number, dateIdx?: number, balIdx?: number } | null | undefined} mapping
 * @returns {{
 *  daily: { day: Date, balance: number }[], minDay: Date, maxDay: Date, analysis?: ReturnType<typeof analyzeRowsForMapping>
 * } | { error: string, analysis?: ReturnType<typeof analyzeRowsForMapping>, needsMapping?: true }}
 */
function buildDailyFromSheetRows(rows, mapping) {
  if (!rows || rows.length < 2) return { error: "הקובץ קצר מדי או ריק." };

  const analysis = analyzeRowsForMapping(rows);
  const autoHeaderIdx = findHeaderRowIndex(rows);

  let headerIdx =
    mapping && Number.isFinite(mapping.headerIdx) ? Number(mapping.headerIdx) : autoHeaderIdx;
  if (!Number.isFinite(headerIdx) || headerIdx < 0 || headerIdx >= rows.length) headerIdx = -1;

  if (headerIdx < 0) {
    return {
      error:
        "לא זוהתה שורת כותרות עם עמודות «תאריך» ו«יתרה». בחרו ידנית שורת כותרות ועמודות מתאימות.",
      analysis,
      needsMapping: true,
    };
  }

  const headerRow = rows[headerIdx] || [];
  const autoCols = findColIndices(headerRow);
  let dateIdx = autoCols.dateIdx;
  let balIdx = autoCols.balIdx;
  if (mapping && Number.isFinite(mapping.dateIdx)) dateIdx = Number(mapping.dateIdx);
  if (mapping && Number.isFinite(mapping.balIdx)) balIdx = Number(mapping.balIdx);

  if (dateIdx < 0 || balIdx < 0) {
    return {
      error: "חסר מיפוי לעמודת תאריך ו/או יתרה. בחרו עמודות ידנית.",
      analysis,
      needsMapping: true,
    };
  }

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
  return { daily, minDay, maxDay, analysis };
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
  return buildDailyFromSheetRows(rows, null);
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

  return buildDailyFromSheetRows(rows, null);
}

/**
 * @param {{ kind: 'xlsx', data: ArrayBuffer } | { kind: 'csv', data: string }}
 * @param {{ headerIdx?: number, dateIdx?: number, balIdx?: number } | null | undefined} mapping
 */
export function parseBankInput(payload, mapping) {
  if (!payload || typeof payload !== "object") {
    return { error: "אין קובץ." };
  }
  if (payload.kind === "csv") {
    // CSV: מנתחים את הטקסט ונבנים ממנו rows; mapping מוחל על שורות.
    const parsed = parseBankCsvText(payload.data);
    if (parsed && !parsed.error && !mapping) return parsed;
    // parseBankCsvText כרגע קורא buildDailyFromSheetRows עם null; אם יש mapping צריך לבנות מחדש
    // כדי לשמור על API אחיד, נפרוס מחדש כאן.
    const Papa = globalThis.Papa;
    if (!Papa || typeof Papa.parse !== "function") return { error: "ספריית Papa Parse לא נטענה." };
    const p2 = Papa.parse(payload.data, { delimiter: "", skipEmptyLines: false });
    const rows = (p2.data || []).map((row) =>
      (row || []).map((cell) => (cell == null || cell === "" ? "" : String(cell)))
    );
    return buildDailyFromSheetRows(rows, mapping);
  }
  if (payload.kind === "xlsx") {
    const XLSX = globalThis.XLSX;
    if (!XLSX || typeof XLSX.read !== "function") return { error: "ספריית XLSX לא נטענה." };
    const wb = XLSX.read(payload.data, { type: "array", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    return buildDailyFromSheetRows(rows, mapping);
  }
  return { error: "סוג קובץ לא נתמך." };
}
