// ─────────────────────────────────────────────────────────────────────────────
// DATA LAYER
// One uniform API used by the rest of the app. Two interchangeable backends:
//   • LOCAL  — browser localStorage (works instantly, no setup, this device only)
//   • CLOUD  — Firebase Firestore + Auth (free, syncs across devices)
// The backend is chosen automatically from config.js (USE_FIREBASE).
// Also holds the shared constants + all "on track / off track" calculations.
// ─────────────────────────────────────────────────────────────────────────────

import { firebaseConfig, USE_FIREBASE } from "./config.js";

// ── Shared constants ─────────────────────────────────────────────────────────
export const TARGETS = {
  startWeight: 82,
  goalWeight: 85,     // bulking — goal is to gain toward this
  steps: 10000,
  sleepHours: 9,      // 11pm–8am
  bedtime: "23:00",
  wake: "08:00",
  workoutsPerWeek: 4,
};

export const MEALS = [
  { key: "cashews", label: "100g Cashew Nuts" },
  { key: "peanutButter", label: "100g Peanut Butter" },
  { key: "yogurt", label: "200g Natural Yogurt" },
  { key: "mumsDinner", label: "Mum's Dinner" },
  { key: "chicken", label: "100g Chicken" },
  { key: "liver", label: "100g Liver" },
  { key: "pitta", label: "2 Pitta Breads" },
  { key: "eggs", label: "4 Eggs" },
  { key: "fruitVeg", label: "Fruits & Vegetables" },
];

export const SPORTS = [
  { key: "football", label: "Football" },
  { key: "boxing", label: "Boxing" },
  { key: "padel", label: "Padel" },
  { key: "sprinting", label: "Sprinting" },
];

// ── Date helpers ─────────────────────────────────────────────────────────────
export function dayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function addDays(key, n) {
  const d = new Date(key + "T12:00:00");
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function prettyDate(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
// Monday-based week containing `key` → array of 7 day keys (Mon..Sun)
export function weekDates(key = dayKey()) {
  const d = new Date(key + "T12:00:00");
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => addDays(dayKey(monday), i));
}
// last N day keys ending today (oldest first)
export function lastNDays(n, end = dayKey()) {
  return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i)));
}

// ── Empty record shapes ──────────────────────────────────────────────────────
export function emptyDay() {
  return {
    weightKg: null,
    bedtime: "",
    wakeTime: "",
    sleepHours: null,
    steps: null,
    workoutDone: false,
    mobilityDone: false,
    sports: Object.fromEntries(SPORTS.map((s) => [s.key, false])),
    meals: Object.fromEntries(MEALS.map((m) => [m.key, false])),
  };
}
export function sleepHoursFrom(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60; // crossed midnight
  return Math.round((mins / 60) * 10) / 10;
}
export function nutritionScore(meals) {
  const total = MEALS.length;
  const done = MEALS.filter((m) => meals && meals[m.key]).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND: LOCAL (localStorage)
// ─────────────────────────────────────────────────────────────────────────────
const localBackend = () => {
  const K = "track:";
  const read = (k, def) => {
    try { const v = localStorage.getItem(K + k); return v ? JSON.parse(v) : def; }
    catch { return def; }
  };
  const write = (k, v) => localStorage.setItem(K + k, JSON.stringify(v));

  return {
    mode: "local",
    requiresLogin: false,
    async init() {},
    onAuth(cb) { cb({ ok: true }); }, // always "signed in" locally
    async signIn() {},
    async signOut() {},
    async getDay(key) { return read("day:" + key, null); },
    async saveDay(key, data) { write("day:" + key, data); },
    async getDays(keys) {
      const out = {};
      for (const k of keys) { const v = read("day:" + k, null); if (v) out[k] = v; }
      return out;
    },
    async getAllDays() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const sk = localStorage.key(i);
        if (sk && sk.startsWith(K + "day:")) {
          out[sk.replace(K + "day:", "")] = JSON.parse(localStorage.getItem(sk));
        }
      }
      return out;
    },
    async getWorkouts() {
      const list = read("workouts", []);
      return list.sort((a, b) => (a.date < b.date ? 1 : -1));
    },
    async saveWorkout(w) {
      const list = read("workouts", []);
      if (w.id) {
        const i = list.findIndex((x) => x.id === w.id);
        if (i >= 0) list[i] = w; else list.push(w);
      } else {
        w.id = "w" + Date.now();
        list.push(w);
      }
      write("workouts", list);
      return w.id;
    },
    async deleteWorkout(id) {
      write("workouts", read("workouts", []).filter((x) => x.id !== id));
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKEND: CLOUD (Firebase) — modules loaded lazily from CDN
// ─────────────────────────────────────────────────────────────────────────────
const cloudBackend = () => {
  const V = "10.12.2";
  let auth, fs, uid, F = {};

  const userDoc = (...path) => F.doc(fs, "users", uid, ...path);

  return {
    mode: "cloud",
    requiresLogin: true,
    async init() {
      const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
      const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
      const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
      const app = appMod.initializeApp(firebaseConfig);
      auth = authMod.getAuth(app);
      await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => {});
      // Firestore with offline cache so check-ins work without signal
      try {
        fs = fsMod.initializeFirestore(app, {
          localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentSingleTabManager() }),
        });
      } catch {
        fs = fsMod.getFirestore(app);
      }
      F = { ...fsMod, _signIn: authMod.signInWithEmailAndPassword, _signOut: authMod.signOut, _onAuth: authMod.onAuthStateChanged };
    },
    onAuth(cb) {
      F._onAuth(auth, (user) => {
        uid = user ? user.uid : null;
        cb({ ok: !!user, email: user ? user.email : null });
      });
    },
    async signIn(email, pass) {
      await F._signIn(auth, email, pass);
    },
    async signOut() { await F._signOut(auth); },
    async getDay(key) {
      const snap = await F.getDoc(userDoc("days", key));
      return snap.exists() ? snap.data() : null;
    },
    async saveDay(key, data) {
      await F.setDoc(userDoc("days", key), data, { merge: true });
    },
    async getDays(keys) {
      const out = {};
      await Promise.all(keys.map(async (k) => {
        const snap = await F.getDoc(userDoc("days", k));
        if (snap.exists()) out[k] = snap.data();
      }));
      return out;
    },
    async getAllDays() {
      const snap = await F.getDocs(F.collection(fs, "users", uid, "days"));
      const out = {};
      snap.forEach((d) => { out[d.id] = d.data(); });
      return out;
    },
    async getWorkouts() {
      const q = F.query(F.collection(fs, "users", uid, "workouts"), F.orderBy("date", "desc"));
      const snap = await F.getDocs(q);
      const out = [];
      snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
      return out;
    },
    async saveWorkout(w) {
      if (w.id) {
        const { id, ...rest } = w;
        await F.setDoc(userDoc("workouts", id), rest, { merge: true });
        return id;
      }
      const ref = await F.addDoc(F.collection(fs, "users", uid, "workouts"), w);
      return ref.id;
    },
    async deleteWorkout(id) { await F.deleteDoc(userDoc("workouts", id)); },
  };
};

// ── Export the chosen backend ────────────────────────────────────────────────
export const db = USE_FIREBASE ? cloudBackend() : localBackend();

// ─────────────────────────────────────────────────────────────────────────────
// ON-TRACK CALCULATIONS  → each returns { value, status: green|amber|red, ... }
// ─────────────────────────────────────────────────────────────────────────────
export function weightStatus(daysMap) {
  const entries = Object.entries(daysMap)
    .filter(([, d]) => d && d.weightKg != null)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!entries.length) return { value: null, status: "amber", delta: null, trend: 0 };
  const latest = entries[entries.length - 1][1].weightKg;
  const goal = TARGETS.goalWeight;
  const delta = Math.round((goal - latest) * 10) / 10; // kg still to gain
  // trend = change over up to last 7 logged weigh-ins
  const window = entries.slice(-7);
  const trend = Math.round((latest - window[0][1].weightKg) * 10) / 10;
  let status;
  if (Math.abs(delta) <= 0.4) status = "green";       // basically at goal
  else if (delta > 0) status = trend >= 0 ? "green" : "red"; // need to gain: gaining good
  else status = trend <= 0 ? "green" : "amber";       // over goal: holding/dropping ok
  return { value: latest, status, delta, trend };
}

export function stepsStatus(steps) {
  if (steps == null) return { value: null, status: "amber", pct: 0 };
  let status = "red";
  if (steps >= TARGETS.steps) status = "green";
  else if (steps >= 7000) status = "amber";
  return { value: steps, status, pct: Math.min(100, Math.round((steps / TARGETS.steps) * 100)) };
}

export function sleepStatus(hours) {
  if (hours == null) return { value: null, status: "amber" };
  let status = "red";
  if (hours >= 8) status = "green";
  else if (hours >= 7) status = "amber";
  return { value: hours, status };
}

export function mobilityWeek(daysMap, refKey = dayKey()) {
  const week = weekDates(refKey);
  const done = week.filter((k) => daysMap[k] && daysMap[k].mobilityDone).length;
  const pct = Math.round((done / 7) * 100);
  let status = "red";
  if (pct >= 70) status = "green";
  else if (pct >= 40) status = "amber";
  return { done, total: 7, pct, status };
}

export function workoutWeek(daysMap, refKey = dayKey()) {
  const week = weekDates(refKey);
  const done = week.filter((k) => daysMap[k] && daysMap[k].workoutDone).length;
  const todayDone = !!(daysMap[refKey] && daysMap[refKey].workoutDone);
  let status = "red";
  if (done >= TARGETS.workoutsPerWeek) status = "green";
  else if (done >= 2) status = "amber";
  return { done, target: TARGETS.workoutsPerWeek, todayDone, status };
}

export function sportsWeek(daysMap, refKey = dayKey()) {
  const week = weekDates(refKey);
  const result = {};
  for (const s of SPORTS) {
    result[s.key] = week.some((k) => daysMap[k] && daysMap[k].sports && daysMap[k].sports[s.key]);
  }
  const done = Object.values(result).filter(Boolean).length;
  let status = "red";
  if (done === SPORTS.length) status = "green";
  else if (done >= 2) status = "amber";
  return { result, done, total: SPORTS.length, status };
}
