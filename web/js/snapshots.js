/**
 * נקודות צילום חודשיות — מקביל ל-bank_balance_chart.monthly_snapshots
 */

import { cmpDay, monthsBetween, snapshotDate } from "./dateUtils.js";

/**
 * @param {{ day: Date, balance: number }[]} daily
 * @param {number|'last'} dayInMonth
 * @returns {{ snapshot: Date, balance: number }[]}
 */
export function monthlySnapshots(daily, dayInMonth) {
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

  let firstOk = -1;
  for (let i = 0; i < rows.length; i++) {
    if (!Number.isNaN(rows[i].balance)) {
      firstOk = i;
      break;
    }
  }
  if (firstOk < 0) return [];

  let lastOk = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!Number.isNaN(rows[i].balance)) {
      lastOk = i;
      break;
    }
  }
  if (lastOk < 0) return [];
  /** בלי שורות פתיחה/סיום בלי יתרה; רווחים באמצע (NaN) נשמרים */
  return rows.slice(firstOk, lastOk + 1);
}
