/**
 * רינדור גרף (ApexCharts) וטבלה
 */

import { fmtDate } from "./dateUtils.js";

let apexChart = null;

export function destroyChart() {
  if (apexChart) {
    apexChart.destroy();
    apexChart = null;
  }
}

/**
 * @param {{ snapshot: Date, balance: number }[]} snapRows
 */
export function renderChart(snapRows) {
  const ApexCharts = globalThis.ApexCharts;
  const el = document.getElementById("chart");
  if (!el) return;

  destroyChart();
  el.innerHTML = "";

  if (!ApexCharts || typeof ApexCharts !== "function") {
    el.innerHTML =
      '<p style="color:#8b9cb3;text-align:center;padding:2rem">ספריית ApexCharts לא נטענה.</p>';
    return;
  }

  const seriesData = snapRows.map((r) => ({
    x: r.snapshot.getTime(),
    y: Number.isNaN(r.balance) ? null : r.balance,
  }));

  const options = {
    series: [{ name: "יתרה", data: seriesData }],
    chart: {
      type: "area",
      height: 440,
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      foreColor: "#c5d0de",
      background: "transparent",
      rtl: true,
      toolbar: {
        show: true,
        offsetY: 4,
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true,
        },
      },
      zoom: { enabled: true, type: "x", autoScaleYaxis: true },
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 520,
      },
      dropShadow: {
        enabled: true,
        top: 4,
        left: 0,
        blur: 12,
        opacity: 0.22,
        color: "#5b9cff",
      },
    },
    dataLabels: { enabled: false },
    stroke: {
      curve: "smooth",
      width: 2.8,
      lineCap: "round",
      connectNulls: false,
    },
    fill: {
      type: "gradient",
      gradient: {
        shade: "dark",
        type: "vertical",
        shadeIntensity: 0.45,
        gradientToColors: ["#141a24"],
        inverseColors: false,
        opacityFrom: 0.65,
        opacityTo: 0.04,
        stops: [0, 88, 100],
      },
    },
    colors: ["#6eb0ff"],
    markers: {
      size: 3.5,
      colors: ["#8ec5ff"],
      strokeColors: "#0f1419",
      strokeWidth: 2,
      hover: { size: 8, sizeOffset: 1 },
    },
    xaxis: {
      type: "datetime",
      labels: {
        datetimeUTC: false,
        style: { colors: "#8b9cb3", fontSize: "11px" },
      },
      axisBorder: { show: true, color: "rgba(255,255,255,0.1)" },
      axisTicks: { color: "rgba(255,255,255,0.08)" },
      crosshairs: {
        show: true,
        stroke: { color: "rgba(91, 156, 255, 0.45)", width: 1, dashArray: 4 },
      },
    },
    yaxis: {
      labels: {
        style: { colors: "#8b9cb3", fontSize: "11px" },
        formatter: (val) =>
          val != null && Number.isFinite(val)
            ? val.toLocaleString("he-IL", { maximumFractionDigits: 0 })
            : "",
      },
    },
    grid: {
      borderColor: "rgba(255,255,255,0.07)",
      strokeDashArray: 5,
      padding: { left: 8, right: 12 },
    },
    tooltip: {
      theme: "dark",
      x: { format: "yyyy-MM-dd" },
      y: {
        formatter: (val) =>
          val != null && Number.isFinite(val)
            ? val.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₪"
            : "—",
      },
    },
    legend: { show: false },
  };

  apexChart = new ApexCharts(el, options);
  apexChart.render();
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
