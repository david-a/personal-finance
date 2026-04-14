/**
 * רינדור גרף (Plotly) וטבלה
 */

import { fmtDate } from "./dateUtils.js";

/**
 * @param {{ snapshot: Date, balance: number }[]} snapRows
 */
export function renderChart(snapRows) {
  const Plotly = globalThis.Plotly;
  if (!Plotly || typeof Plotly.react !== "function") {
    return;
  }

  const xs = snapRows.map((r) => fmtDate(r.snapshot));
  const ys = snapRows.map((r) => (Number.isNaN(r.balance) ? null : r.balance));
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
      xaxis: { title: "תאריך צילום (סוף יום)", type: "date", tickformat: "%Y-%m-%d" },
      yaxis: { title: "יתרה (₪)", tickformat: ",.0f" },
      hovermode: "x unified",
      font: { family: "system-ui, Arial, sans-serif" },
    },
    { responsive: true, locale: "he" }
  );
}

/**
 * @param {{ snapshot: Date, balance: number }[]} snapRows
 */
export function renderTable(snapRows) {
  const tbody = document.querySelector("#points-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  for (const r of snapRows) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = fmtDate(r.snapshot);
    const td2 = document.createElement("td");
    td2.textContent = Number.isNaN(r.balance)
      ? "—"
      : r.balance.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    tr.appendChild(td1);
    tr.appendChild(td2);
    tbody.appendChild(tr);
  }
}
