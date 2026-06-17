# Track — Personal Tracking App

A clean, dark, iPhone-first tracker for the few things that matter: **weight, sleep,
steps, workouts, mobility, weekly sports, and a daily meal checklist** — with a dashboard
that shows at a glance whether you're on track, and graphs for progress over time.

No App Store, no servers to run, free to host. It's a web app you "Add to Home Screen"
so it behaves like a native iPhone app (fullscreen, dark, works offline).

---

## How it works

- **Runs as a website** hosted free on **GitHub Pages**.
- **Two data modes:**
  - **Local mode (default):** works immediately, data saved on the device only. Good for
    trying it out.
  - **Cloud mode:** paste a free **Firebase** config and your data syncs across devices and
    survives even if Safari clears storage. Recommended for daily use.
- The app **auto-switches to cloud mode** the moment you fill in `config.js`.

---

## Quick start (try it in local mode — 2 minutes)

1. Open `index.html` in a browser, or put these files on any web host / GitHub Pages.
2. Start logging. Data is saved on that device.

To use it on your iPhone properly and sync across devices, do the cloud setup below.

---

## Cloud sync setup (Firebase — free, ~5–10 minutes, all in a browser)

### 1. Create a Firebase project
1. Go to <https://console.firebase.google.com> → **Add project**. Name it (e.g. `track`).
   You can disable Google Analytics. Create.

### 2. Turn on the database
1. Left menu → **Build → Firestore Database → Create database**.
2. Choose a location, start in **Production mode** (rules are set in step 5).

### 3. Turn on login
1. Left menu → **Build → Authentication → Get started**.
2. **Sign-in method** tab → enable **Email/Password** → Save.
3. **Users** tab → **Add user** → enter your email + a password. (This is your one login.)

### 4. Get your web config
1. Top-left ⚙️ → **Project settings**.
2. Scroll to **Your apps** → click the **`</>`** (Web) icon → register an app (any nickname).
3. Copy the `firebaseConfig` object it shows you (apiKey, authDomain, projectId, etc.).
4. Paste those values into **`config.js`** in this project, replacing the `PASTE_…` placeholders.

### 5. Lock down the data (security rules)
1. Firebase console → **Firestore Database → Rules** tab.
2. Replace everything with the rules below → **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

This means only *you*, signed in, can read or write *your* data.

---

## Put it on your iPhone (GitHub Pages)

1. Create a new repository on GitHub (e.g. `track`). Make it **public** (Pages is free for
   public repos). *(The Firebase web config is safe to be public — your data is protected by
   the login + rules above, not by hiding the config.)*
2. Upload all the files in this folder: repo page → **Add file → Upload files** → drag the
   whole `personal-tracker` contents in → **Commit**.
3. Repo → **Settings → Pages** → under *Branch* pick `main` / `/root` → **Save**.
4. Wait ~1 minute, then open the green URL it gives you
   (`https://<your-username>.github.io/track/`) **in Safari on your iPhone**.
5. Tap the **Share** button → **Add to Home Screen**. Open it from the home screen icon.
6. Sign in once with the email/password you created. Done — it stays signed in.

---

## Daily use

- **Check-in tab:** update weight, sleep (bedtime/wake auto-calculates hours), steps,
  workout/mobility/sport toggles, and tick off your meals. One **Save**. Under 2 minutes.
- **Home tab:** every card is colored **green / amber / red** so on-track vs off-track is
  instant. Weight trends toward your 85 kg goal, steps vs 10k, sleep vs 9h, workouts and
  mobility this week, the 4 weekly sports, and today's nutrition score.
- **Workouts tab:** start a workout, add exercises and sets (kg × reps). It shows **last
  time's numbers** for each exercise so you can push progressive overload, and draws a
  **progression graph** per exercise. Saving a workout also ticks today's workout on the home
  screen.
- **Trends tab:** full-size weight / sleep / steps graphs over 30 / 90 days / all time.

---

## Changing your targets

Edit the `TARGETS` object near the top of **`data.js`**:

```js
export const TARGETS = {
  startWeight: 82,
  goalWeight: 85,     // bulking — goal is to gain toward this
  steps: 10000,
  sleepHours: 9,      // 11pm–8am
  workoutsPerWeek: 4,
};
```

Meal items live in `MEALS` and sports in `SPORTS` in the same file.

---

## Files

| File | What it does |
|---|---|
| `index.html` | App shell + bottom tab bar + login screen |
| `styles.css` | Dark, minimalist, iPhone-first styling |
| `config.js` | **The only file you edit** — Firebase config (or leave for local mode) |
| `data.js` | Data layer (local + cloud), targets, meals, on-track calculations |
| `app.js` | Boot, login, dashboard, daily check-in, trends |
| `workouts.js` | Workout logger + per-exercise progression |
| `charts.js` | Graphs (Chart.js) |
| `manifest.json`, `service-worker.js`, `icons/` | Makes it installable + offline |
