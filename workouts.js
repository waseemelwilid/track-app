// ─────────────────────────────────────────────────────────────────────────────
// WORKOUTS — Hevy / Strong style logger with progressive-overload prompts and
// per-exercise progression graphs. Renders into the shared #view container and
// manages its own little internal navigation (list → editor → exercise detail).
// ─────────────────────────────────────────────────────────────────────────────
import { db, dayKey, prettyDate } from "./data.js";
import { renderExercise } from "./charts.js";

let view;
let cache = null; // workouts list cache

async function load(force = false) {
  if (!cache || force) cache = await db.getWorkouts();
  return cache;
}

export async function renderWorkoutsTab(container) {
  view = container;
  await showList();
}

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const niceDate = (key) => new Date(key + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

function topWeight(ex) {
  let max = 0;
  (ex.sets || []).forEach((s) => { if (s.weightKg != null && s.reps) max = Math.max(max, s.weightKg); });
  return max;
}
function summarize(w) {
  const exCount = (w.exercises || []).length;
  const setCount = (w.exercises || []).reduce((n, e) => n + (e.sets ? e.sets.length : 0), 0);
  return `${exCount} exercise${exCount === 1 ? "" : "s"} · ${setCount} sets`;
}
// most recent prior performance of an exercise by name
function lastPerformance(list, name, excludeId) {
  for (const w of list) {
    if (w.id === excludeId) continue;
    const ex = (w.exercises || []).find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (ex && ex.sets && ex.sets.length) {
      return ex.sets.map((s) => `${s.weightKg ?? 0}kg×${s.reps ?? 0}`).join(", ");
    }
  }
  return null;
}

// ── LIST VIEW ────────────────────────────────────────────────────────────────
async function showList() {
  view.innerHTML = `<div class="empty">Loading…</div>`;
  const list = await load(true);

  // unique exercise names for progression links
  const names = [...new Set(list.flatMap((w) => (w.exercises || []).map((e) => e.name)))].sort();

  view.innerHTML = `
    <div class="page-title">Workouts</div>
    <div class="page-date">Log sets, track progressive overload</div>
    <button id="new-workout" class="btn-primary" style="width:100%;margin-bottom:16px">＋ Start new workout</button>

    ${list.length === 0 ? `<div class="empty">No workouts yet.<br/>Tap “Start new workout” to log your first session.</div>` : `
      <div class="section-title">History</div>
      ${list.map((w) => `
        <div class="list-item" data-open="${w.id}">
          <div>
            <div class="li-title">${esc(w.name || "Workout")}</div>
            <div class="li-sub">${niceDate(w.date)} · ${summarize(w)}</div>
          </div>
          <span class="li-chev">›</span>
        </div>`).join("")}
    `}

    ${names.length ? `
      <div class="section-title">Exercise Progression</div>
      ${names.map((n) => `<div class="list-item" data-ex="${esc(n)}"><div class="li-title">${esc(n)}</div><span class="li-chev">📈</span></div>`).join("")}
    ` : ""}
  `;

  $("#new-workout").addEventListener("click", () => showEditor(null));
  view.querySelectorAll("[data-open]").forEach((el) =>
    el.addEventListener("click", () => {
      const w = list.find((x) => x.id === el.dataset.open);
      if (w) showEditor(w);
    })
  );
  view.querySelectorAll("[data-ex]").forEach((el) =>
    el.addEventListener("click", () => showExercise(el.dataset.ex))
  );
}

// ── EDITOR ───────────────────────────────────────────────────────────────────
// draft shape: { id?, date, name, exercises: [{ name, sets:[{reps, weightKg}] }] }
let draft = null;

async function showEditor(existing) {
  const list = await load();
  draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : { date: dayKey(), name: "", exercises: [] };
  if (!draft.exercises) draft.exercises = [];
  renderEditor(list);
}

function renderEditor(list) {
  const isNew = !draft.id;
  view.innerHTML = `
    <div class="top-actions">
      <button class="link-btn" id="ed-cancel">‹ Back</button>
      ${isNew ? "" : `<button class="link-btn" id="ed-delete" style="color:var(--red)">Delete</button>`}
    </div>
    <div class="field">
      <input id="ed-name" type="text" placeholder="Workout name (e.g. Push Day)" value="${esc(draft.name || "")}" />
    </div>

    <div id="ed-exercises">
      ${draft.exercises.map((ex, i) => exerciseBlock(ex, i, list)).join("")}
    </div>

    <button id="ed-add-ex" class="btn-add">＋ Add exercise</button>

    <div style="height:90px"></div>
    <div class="save-bar">
      <div id="ed-flash" class="saved-flash"></div>
      <button id="ed-save" class="btn-primary">Save workout</button>
    </div>
  `;

  $("#ed-cancel").addEventListener("click", showList);
  if ($("#ed-delete")) $("#ed-delete").addEventListener("click", async () => {
    await db.deleteWorkout(draft.id);
    cache = null;
    showList();
  });
  $("#ed-name").addEventListener("input", (e) => { draft.name = e.target.value; });
  $("#ed-add-ex").addEventListener("click", () => {
    const name = prompt("Exercise name (e.g. Bench Press)");
    if (name && name.trim()) {
      draft.exercises.push({ name: name.trim(), sets: [{ reps: null, weightKg: null }] });
      renderEditor(list);
    }
  });

  bindExerciseEvents(list);

  $("#ed-save").addEventListener("click", async () => {
    // clean: drop empty sets / exercises
    const clean = {
      date: draft.date,
      name: (draft.name || "").trim() || "Workout",
      exercises: draft.exercises
        .map((ex) => ({
          name: ex.name,
          sets: (ex.sets || []).filter((s) => s.reps != null || s.weightKg != null)
            .map((s) => ({ reps: s.reps ?? 0, weightKg: s.weightKg ?? 0 })),
        }))
        .filter((ex) => ex.sets.length > 0),
    };
    if (draft.id) clean.id = draft.id;
    if (clean.exercises.length === 0) { $("#ed-flash").textContent = "Add at least one set"; return; }
    const btn = $("#ed-save"); btn.textContent = "Saving…"; btn.disabled = true;
    try {
      await db.saveWorkout(clean);
      // mark the workout as done for that day (feeds the dashboard)
      await db.saveDay(clean.date, { workoutDone: true });
      cache = null;
      showList();
    } catch (e) {
      btn.textContent = "Save workout"; btn.disabled = false;
      $("#ed-flash").textContent = "Couldn't save — try again";
    }
  });
}

function exerciseBlock(ex, i, list) {
  const last = lastPerformance(list, ex.name, draft.id);
  return `
    <div class="ex-block" data-ex-i="${i}">
      <div class="ex-head">
        <span class="ex-name">${esc(ex.name)}</span>
        <button class="rm-ex link-btn" data-rm-ex="${i}" style="color:var(--text-dim)">✕</button>
      </div>
      <div class="ex-last">${last ? "Last time: " + esc(last) : "First time logging this"}</div>
      <div class="set-head"><span>#</span><span>kg</span><span>Reps</span><span></span></div>
      <div class="sets">
        ${(ex.sets || []).map((s, j) => `
          <div class="set-row" data-set="${i}-${j}">
            <span class="set-n">${j + 1}</span>
            <input type="number" inputmode="decimal" step="0.5" class="in-w" placeholder="0" value="${s.weightKg ?? ""}" />
            <input type="number" inputmode="numeric" class="in-r" placeholder="0" value="${s.reps ?? ""}" />
            <button class="rm rm-set" data-rm-set="${i}-${j}">✕</button>
          </div>`).join("")}
      </div>
      <button class="btn-add add-set" data-add-set="${i}">＋ Add set</button>
    </div>
  `;
}

function bindExerciseEvents(list) {
  // weight / reps inputs
  view.querySelectorAll(".set-row").forEach((row) => {
    const [i, j] = row.dataset.set.split("-").map(Number);
    row.querySelector(".in-w").addEventListener("input", (e) => {
      draft.exercises[i].sets[j].weightKg = e.target.value === "" ? null : parseFloat(e.target.value);
    });
    row.querySelector(".in-r").addEventListener("input", (e) => {
      draft.exercises[i].sets[j].reps = e.target.value === "" ? null : parseInt(e.target.value, 10);
    });
  });
  // add set
  view.querySelectorAll("[data-add-set]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.addSet);
      const sets = draft.exercises[i].sets;
      const prev = sets[sets.length - 1];
      sets.push({ reps: prev ? prev.reps : null, weightKg: prev ? prev.weightKg : null });
      renderEditor(list);
    })
  );
  // remove set
  view.querySelectorAll("[data-rm-set]").forEach((b) =>
    b.addEventListener("click", () => {
      const [i, j] = b.dataset.rmSet.split("-").map(Number);
      draft.exercises[i].sets.splice(j, 1);
      if (draft.exercises[i].sets.length === 0) draft.exercises[i].sets.push({ reps: null, weightKg: null });
      renderEditor(list);
    })
  );
  // remove exercise
  view.querySelectorAll("[data-rm-ex]").forEach((b) =>
    b.addEventListener("click", () => {
      draft.exercises.splice(Number(b.dataset.rmEx), 1);
      renderEditor(list);
    })
  );
}

// ── EXERCISE DETAIL (progression) ────────────────────────────────────────────
async function showExercise(name) {
  const list = await load();
  // sessions containing this exercise, oldest first
  const points = list
    .filter((w) => (w.exercises || []).some((e) => e.name.toLowerCase() === name.toLowerCase()))
    .map((w) => {
      const ex = w.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
      return { date: w.date, topWeight: topWeight(ex), sets: ex.sets || [] };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const best = points.reduce((m, p) => Math.max(m, p.topWeight), 0);

  view.innerHTML = `
    <div class="top-actions"><button class="link-btn" id="ex-back">‹ Workouts</button></div>
    <div class="page-title">${esc(name)}</div>
    <div class="page-date">Best: ${best} kg · ${points.length} session${points.length === 1 ? "" : "s"}</div>

    ${points.length >= 2 ? `<div class="card"><div class="chart-wrap tall"><canvas id="exChart"></canvas></div></div>`
      : `<div class="empty">Log this exercise at least twice to see a progression graph.</div>`}

    <div class="section-title">History</div>
    ${[...points].reverse().map((p) => `
      <div class="card">
        <div class="card-row"><span class="li-title">${niceDate(p.date)}</span><span class="muted">top ${p.topWeight}kg</span></div>
        <div class="card-sub">${p.sets.map((s) => `${s.weightKg ?? 0}kg×${s.reps ?? 0}`).join("  ·  ")}</div>
      </div>`).join("")}
  `;
  $("#ex-back").addEventListener("click", showList);
  if (points.length >= 2) renderExercise($("#exChart"), points);
}

function $(s) { return view.querySelector(s); }
