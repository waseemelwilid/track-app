// Chart.js helpers (Chart loaded globally via CDN in index.html).
import { TARGETS } from "./data.js";

const GRID = "#2a2a31";
const DIM = "#9a9aa6";
const ACCENT = "#5b8cff";
const GREEN = "#34c759";

const registry = {}; // canvasId -> Chart instance (so we can destroy before re-render)

export async function waitForChart() {
  for (let i = 0; i < 100 && !window.Chart; i++) await new Promise((r) => setTimeout(r, 30));
  return window.Chart;
}

function base(canvas, cfg) {
  const id = canvas.id || (canvas.id = "c" + Math.random().toString(36).slice(2));
  if (registry[id]) registry[id].destroy();
  registry[id] = new window.Chart(canvas, cfg);
  return registry[id];
}

const axes = (yOpts = {}) => ({
  x: { grid: { display: false }, ticks: { color: DIM, maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 10 } } },
  y: { grid: { color: GRID }, ticks: { color: DIM, font: { size: 10 } }, ...yOpts },
});

const noLegend = { legend: { display: false } };

// labels: short date labels from day keys
const lbl = (key) => {
  const d = new Date(key + "T12:00:00");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

export async function renderWeight(canvas, daysMap, range = 90) {
  await waitForChart();
  const entries = Object.entries(daysMap)
    .filter(([, d]) => d && d.weightKg != null)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-range);
  const labels = entries.map(([k]) => lbl(k));
  const data = entries.map(([, d]) => d.weightKg);
  const goalLine = labels.map(() => TARGETS.goalWeight);
  base(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { data, borderColor: ACCENT, backgroundColor: "rgba(91,140,255,.12)", fill: true,
          tension: .35, pointRadius: data.length > 30 ? 0 : 3, pointBackgroundColor: ACCENT, borderWidth: 2.5 },
        { data: goalLine, borderColor: GREEN, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { ...noLegend, tooltip: { enabled: true } },
      scales: axes({ suggestedMin: Math.min(...data, TARGETS.goalWeight) - 1, suggestedMax: Math.max(...data, TARGETS.goalWeight) + 1 }),
    },
  });
}

export async function renderSteps(canvas, daysMap, keys) {
  await waitForChart();
  const labels = keys.map(lbl);
  const data = keys.map((k) => (daysMap[k] && daysMap[k].steps) || 0);
  const colors = data.map((v) => (v >= TARGETS.steps ? GREEN : v >= 7000 ? "#ff9f0a" : "#ff453a"));
  base(canvas, {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 6, maxBarThickness: 34 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { ...noLegend },
      scales: {
        ...axes({ beginAtZero: true }),
        y: { grid: { color: GRID }, ticks: { color: DIM, font: { size: 10 }, callback: (v) => v / 1000 + "k" }, beginAtZero: true },
      },
    },
  });
}

export async function renderSleep(canvas, daysMap, keys) {
  await waitForChart();
  const labels = keys.map(lbl);
  const data = keys.map((k) => (daysMap[k] && daysMap[k].sleepHours) != null ? daysMap[k].sleepHours : null);
  const target = labels.map(() => TARGETS.sleepHours);
  base(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { data, borderColor: ACCENT, backgroundColor: "rgba(91,140,255,.12)", fill: true, tension: .35,
          pointRadius: 3, pointBackgroundColor: ACCENT, borderWidth: 2.5, spanGaps: true },
        { data: target, borderColor: GREEN, borderDash: [5, 5], pointRadius: 0, borderWidth: 1.5, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { ...noLegend },
      scales: axes({ beginAtZero: true, suggestedMax: 11 }),
    },
  });
}

// exercise progression: top-set weight per session
export async function renderExercise(canvas, points) {
  await waitForChart();
  const labels = points.map((p) => lbl(p.date));
  const data = points.map((p) => p.topWeight);
  base(canvas, {
    type: "line",
    data: { labels, datasets: [{ data, borderColor: ACCENT, backgroundColor: "rgba(91,140,255,.12)",
      fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: ACCENT, borderWidth: 2.5 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { ...noLegend, tooltip: { callbacks: { label: (c) => c.parsed.y + " kg" } } },
      scales: axes({ beginAtZero: false }),
    },
  });
}
