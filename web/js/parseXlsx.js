/**
 * קריאת ייצוא בנק מ-Excel (SheetJS דרך global XLSX).
 */

import { cmpDay, toBalance, toDate } from "./dateUtils.js";

function normalizeHeader(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ");
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

/**
 * @param {ArrayBuffer} ab
 * @returns {{ daily: { day: Date, balance: number }[], minDay: Date, maxDay: Date } | { error: string }}
 */
export function parseBankXlsx(ab) {
  const XLSX = globalThis.XLSX;
  if (!XLSX || typeof XLSX.read !== "function") {
    return { error: "ספריית XLSX לא נטענה." };
  }

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
