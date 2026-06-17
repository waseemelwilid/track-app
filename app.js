// ─────────────────────────────────────────────────────────────────────────────
// APP — boot, auth, tab routing, Dashboard, Daily Check-in, Trends.
// Workouts live in workouts.js.
// ─────────────────────────────────────────────────────────────────────────────
import {
  db, TARGETS, MEALS, SPORTS,
  dayKey, prettyDate, lastNDays,
  emptyDay, sleepHoursFrom, nutritionScore,
  weightStatus, stepsStatus, sleepStatus, mobilityWeek, workoutWeek, sportsWeek,
} from "./data.js";
import { renderWeight, renderSteps, renderSleep } from "./charts.js";
import { renderWorkoutsTab } from "./workouts.js";

const $ = (sel) => document.querySelector(sel);
const view = $("#view");

let daysCache = null;           // { 'YYYY-MM-DD': dayData }
let currentTab = "dashboard";

async function days(force = false) {
  if (!daysCache || force) daysCache = await db.getAllDays();
  return daysCache;
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    registerSW();
    watchOnline();
    await db.init();

    db.onAuth((s) => {
      if (db.requiresLogin && !s.ok) {
        $("#splash").classList.add("hidden");
        $("#app").classList.add("hidden");
        $("#login").classList.remove("hidden");
        return;
      }
      startApp();
    });
  } catch (e) {
    bootError(e);
  }
}

function bootError(e) {
  const msg = (e && e.message) ? e.message : String(e);
  const splash = $("#splash");
  if (splash) {
    splash.innerHTML =
      `<div style="max-width:320px;text-align:center;padding:24px">
        <div style="font-size:40px;margin-bottom:12px">⚠️</div>
        <div style="font-weight:800;font-size:18px;margin-bottom:8px">Couldn't start</div>
        <div style="color:#9a9aa6;font-size:14px;line-height:1.5">${msg}</div>
        <div style="color:#9a9aa6;font-size:13px;margin-top:14px">If you opened the file directly, host it online (Netlify/GitHub) and open that web address instead.</div>
      </div>`;
  }
}

let started = false;
function startApp() {
  $("#login").classList.add("hidden");
  $("#splash").classList.add("hidden");
  $("#app").classList.remove("hidden");
  if (started) { renderDashboard(); return; }
  started = true;
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => switchTab(t.dataset.tab))
  );
  switchTab("dashboard");
}

// ── Login (cloud mode) ───────────────────────────────────────────────────────
$("#login-btn").addEventListener("click", async () => {
  const email = $("#login-email").value.trim();
  const pass = $("#login-pass").value;
  const err = $("#login-error");
  err.textContent = "";
  if (!email || !pass) { err.textContent = "Enter email and password."; return; }
  try {
    $("#login-btn").textContent = "Signing in...";
    await db.signIn(email, pass);
  } catch (e) {
    err.textContent = friendlyAuthError(e);
    $("#login-btn").textContent = "Sign in";
  }
});
function friendlyAuthError(e) {
  const c = (e && e.code) || "";
  if (c.includes("invalid-cred") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "Wrong email or password.";
  if (c.includes("network")) return "No connection.";
  return "Couldn't sign in. Try again.";
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
async function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  view.scrollTop = 0;
  window.scrollTo(0, 0);
  if (tab === "dashboard") return renderDashboard();
  if (tab === "checkin") return renderCheckin();
  if (tab === "workouts") return renderWorkoutsTab(view);
  if (tab === "trends") return renderTrends();
}
// allow other modules to bounce back to the dashboard / refresh
export async function refreshAfterChange() { daysCache = null; if (currentTab === "dashboard") renderDashboard(); }

// ── DASHBOARD ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  view.innerHTML = `<div class="empty">Loading…</div>`;
  const map = await days(true);
  const today = dayKey();
  const todayData = map[today] || emptyDay();

  const w = weightStatus(map);
  const steps = stepsStatus(todayData.steps);
  const sleep = sleepStatus(todayData.sleepHours);
  const mob = mobilityWeek(map);
  const wk = workoutWeek(map);
  const sp = sportsWeek(map);
  const nut = nutritionScore(todayData.meals);

  const week7 = lastNDays(7);
  const trendArrow = w.trend > 0 ? "↑" : w.trend < 0 ? "↓" : "→";
  const deltaTxt = w.value == null ? "No weight logged yet"
    : w.delta > 0 ? `${w.delta.toFixed(1)} kg to go → ${TARGETS.goalWeight}kg`
    : w.delta < 0 ? `${Math.abs(w.delta).toFixed(1)} kg over goal`
    : `At goal 🎯`;

  view.innerHTML = `
    <div class="top-actions">
      <div>
        <div class="page-title">Today</div>
        <div class="page-date">${prettyDate()}</div>
      </div>
      ${db.mode === "cloud" ? `<button id="signout" class="signout">Sign out</button>` : ``}
    </div>

    <div class="card stat ${w.status}">
      <div class="card-row">
        <span class="card-label">Current Weight</span>
        <span class="dot ${w.status}"></span>
      </div>
      <div class="card-row" style="margin-top:6px">
        <div class="card-big">${w.value != null ? w.value.toFixed(1) : "–"}<span class="card-unit"> kg</span></div>
        <div class="card-sub txt-${w.status}">${trendArrow} ${Math.abs(w.trend).toFixed(1)} kg</div>
      </div>
      <div class="card-sub">${deltaTxt}</div>
      <div class="chart-wrap" style="height:150px"><canvas id="dashWeight"></canvas></div>
    </div>

    <div class="grid2">
      <div class="card stat ${steps.status}">
        <div class="card-label">Steps</div>
        <div class="card-big">${steps.value != null ? steps.value.toLocaleString() : "–"}</div>
        <div class="card-sub">/ ${TARGETS.steps.toLocaleString()}</div>
        <div class="bar"><span class="${steps.status}" style="width:${steps.pct}%"></span></div>
      </div>
      <div class="card stat ${sleep.status}">
        <div class="card-label">Sleep last night</div>
        <div class="card-big">${sleep.value != null ? sleep.value : "–"}<span class="card-unit"> h</span></div>
        <div class="card-sub">target ${TARGETS.sleepHours}h</div>
        <div class="chart-wrap" style="height:48px"><canvas id="dashSleep"></canvas></div>
      </div>
    </div>

    <div class="grid2">
      <div class="card stat ${wk.status}">
        <div class="card-label">Workouts</div>
        <div class="card-big">${wk.done}<span class="card-unit"> / ${wk.target}</span></div>
        <div class="card-sub">${wk.todayDone ? "✓ done today" : "this week"}</div>
      </div>
      <div class="card stat ${mob.status}">
        <div class="card-label">Mobility</div>
        <div class="card-big">${mob.pct}<span class="card-unit">%</span></div>
        <div class="card-sub">${mob.done}/7 days this week</div>
      </div>
    </div>

    <div class="section-title">Weekly Activity · ${sp.done}/${sp.total}</div>
    <div class="card stat ${sp.status}">
      <div class="chips">
        ${SPORTS.map((s) => `
          <div class="chip ${sp.result[s.key] ? "done" : ""}">
            <span>${s.label}</span>
            <span class="mark ${sp.result[s.key] ? "" : "off"}">${sp.result[s.key] ? "✓" : "○"}</span>
          </div>`).join("")}
      </div>
    </div>

    <div class="section-title">Nutrition Today</div>
    <div class="card stat ${nut.pct >= 80 ? "green" : nut.pct >= 50 ? "amber" : "red"}">
      <div class="card-row">
        <div class="card-big">${nut.pct}<span class="card-unit">%</span></div>
        <span class="score-pill">${nut.done} / ${nut.total} foods</span>
      </div>
      <div class="bar"><span class="${nut.pct >= 80 ? "green" : nut.pct >= 50 ? "amber" : "red"}" style="width:${nut.pct}%"></span></div>
    </div>

    <div class="section-title">7-Day Steps</div>
    <div class="card"><div class="chart-wrap"><canvas id="dashSteps"></canvas></div></div>
  `;

  if ($("#signout")) $("#signout").addEventListener("click", () => db.signOut());

  if (w.value != null) renderWeight($("#dashWeight"), map, 90);
  renderSteps($("#dashSteps"), map, week7);
  renderSleep($("#dashSleep"), map, week7);
}

// ── DAILY CHECK-IN ───────────────────────────────────────────────────────────
async function renderCheckin() {
  view.innerHTML = `<div class="empty">Loading…</div>`;
  const today = dayKey();
  const map = await days();
  // start from saved today, else prefill weight from most recent entry
  const saved = (await db.getDay(today)) || null;
  const d = saved ? { ...emptyDay(), ...saved, sports: { ...emptyDay().sports, ...(saved.sports || {}) }, meals: { ...emptyDay().meals, ...(saved.meals || {}) } } : emptyDay();
  if (d.weightKg == null) {
    const prev = Object.entries(map).filter(([, x]) => x && x.weightKg != null).sort((a, b) => (a[0] < b[0] ? 1 : -1))[0];
    if (prev) d._prevWeight = prev[1].weightKg;
  }

  view.innerHTML = `
    <div class="page-title">Check-in</div>
    <div class="page-date">${prettyDate()} · under 2 minutes</div>

    <div class="section-title">Weight</div>
    <div class="field">
      <input id="ci-weight" type="number" inputmode="decimal" step="0.1" placeholder="${d._prevWeight != null ? d._prevWeight.toFixed(1) + " (last)" : "kg"}" value="${d.weightKg != null ? d.weightKg : ""}" />
    </div>

    <div class="section-title">Sleep</div>
    <div class="field-2">
      <div class="field"><label>Bedtime</label><input id="ci-bed" type="time" value="${d.bedtime || TARGETS.bedtime}" /></div>
      <div class="field"><label>Wake</label><input id="ci-wake" type="time" value="${d.wakeTime || TARGETS.wake}" /></div>
    </div>
    <div id="ci-sleepcalc" class="sleep-calc"></div>

    <div class="section-title">Steps</div>
    <div class="field"><input id="ci-steps" type="number" inputmode="numeric" placeholder="${TARGETS.steps.toLocaleString()} target" value="${d.steps != null ? d.steps : ""}" /></div>

    <div class="section-title">Activity</div>
    ${toggle("ci-workout", "Workout completed", d.workoutDone)}
    ${toggle("ci-mobility", "Mobility completed", d.mobilityDone)}
    ${SPORTS.map((s) => toggle("ci-sport-" + s.key, s.label, d.sports[s.key])).join("")}

    <div class="section-title">Meals <span id="ci-score" class="score-pill"></span></div>
    ${MEALS.map((m) => mealRow("ci-meal-" + m.key, m.label, d.meals[m.key])).join("")}

    <div style="height:80px"></div>
    <div class="save-bar">
      <div id="ci-flash" class="saved-flash"></div>
      <button id="ci-save" class="btn-primary">Save check-in</button>
    </div>
  `;

  const updateSleep = () => {
    const h = sleepHoursFrom($("#ci-bed").value, $("#ci-wake").value);
    $("#ci-sleepcalc").textContent = h != null ? `${h} hours of sleep` : "";
  };
  $("#ci-bed").addEventListener("change", updateSleep);
  $("#ci-wake").addEventListener("change", updateSleep);
  updateSleep();

  // meal rows toggle + live score
  const updateScore = () => {
    const done = MEALS.filter((m) => $("#ci-meal-" + m.key).classList.contains("on")).length;
    $("#ci-score").textContent = `${done} / ${MEALS.length}`;
  };
  MEALS.forEach((m) => {
    const row = $("#ci-meal-" + m.key);
    row.addEventListener("click", () => { row.classList.toggle("on"); updateScore(); });
  });
  updateScore();

  $("#ci-save").addEventListener("click", async () => {
    const bed = $("#ci-bed").value, wake = $("#ci-wake").value;
    const wv = $("#ci-weight").value;
    const sv = $("#ci-steps").value;
    const rec = {
      weightKg: wv === "" ? null : parseFloat(wv),
      bedtime: bed, wakeTime: wake,
      sleepHours: sleepHoursFrom(bed, wake),
      steps: sv === "" ? null : parseInt(sv, 10),
      workoutDone: $("#ci-workout").checked,
      mobilityDone: $("#ci-mobility").checked,
      sports: Object.fromEntries(SPORTS.map((s) => [s.key, $("#ci-sport-" + s.key).checked])),
      meals: Object.fromEntries(MEALS.map((m) => [m.key, $("#ci-meal-" + m.key).classList.contains("on")])),
    };
    rec.nutritionScore = nutritionScore(rec.meals).pct;
    const btn = $("#ci-save");
    btn.textContent = "Saving…"; btn.disabled = true;
    try {
      await db.saveDay(today, rec);
      daysCache = null;
      $("#ci-flash").textContent = "✓ Saved";
      btn.textContent = "Save check-in"; btn.disabled = false;
      setTimeout(() => switchTab("dashboard"), 550);
    } catch (e) {
      $("#ci-flash").textContent = "Couldn't save — try again";
      btn.textContent = "Save check-in"; btn.disabled = false;
    }
  });
}

function toggle(id, label, on) {
  return `<label class="toggle-row"><span>${label}</span>
    <span class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}/><span class="slider"></span></span></label>`;
}
function mealRow(id, label, on) {
  return `<div class="check-row ${on ? "on" : ""}" id="${id}"><span class="box">✓</span><span>${label}</span></div>`;
}

// ── TRENDS ───────────────────────────────────────────────────────────────────
let trendRange = 90;
async function renderTrends() {
  view.innerHTML = `<div class="empty">Loading…</div>`;
  const map = await days();
  view.innerHTML = `
    <div class="page-title">Trends</div>
    <div class="page-date">Progress over time</div>
    <div class="seg" id="trend-seg">
      <button data-r="30" class="${trendRange === 30 ? "active" : ""}">30d</button>
      <button data-r="90" class="${trendRange === 90 ? "active" : ""}">90d</button>
      <button data-r="3650" class="${trendRange === 3650 ? "active" : ""}">All</button>
    </div>

    <div class="section-title">Weight (goal ${TARGETS.goalWeight}kg)</div>
    <div class="card"><div class="chart-wrap tall"><canvas id="trWeight"></canvas></div></div>

    <div class="section-title">Sleep (target ${TARGETS.sleepHours}h)</div>
    <div class="card"><div class="chart-wrap tall"><canvas id="trSleep"></canvas></div></div>

    <div class="section-title">Steps (target ${TARGETS.steps.toLocaleString()})</div>
    <div class="card"><div class="chart-wrap tall"><canvas id="trSteps"></canvas></div></div>
  `;
  $("#trend-seg").querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { trendRange = parseInt(b.dataset.r, 10); renderTrends(); })
  );
  const keys = lastNDays(Math.min(trendRange, 60));
  renderWeight($("#trWeight"), map, trendRange);
  renderSleep($("#trSleep"), map, keys);
  renderSteps($("#trSteps"), map, keys);
}

// ── Service worker + offline ─────────────────────────────────────────────────
function registerSW() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
  }
}
function watchOnline() {
  const banner = $("#offline");
  const upd = () => banner.classList.toggle("hidden", navigator.onLine);
  window.addEventListener("online", upd);
  window.addEventListener("offline", upd);
  upd();
}

boot();
