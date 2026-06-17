// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — this is the ONLY file you need to edit.
//
// The app works straight away in LOCAL mode (data stored on this device only).
// To turn on free CLOUD SYNC across devices, paste your Firebase web config
// below (see README.md for the 5-minute setup). As soon as the apiKey is filled
// in with a real value, the app automatically switches to cloud mode + login.
// ─────────────────────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE.firebaseapp.com",
  projectId: "PASTE",
  storageBucket: "PASTE.appspot.com",
  messagingSenderId: "PASTE",
  appId: "PASTE",
};

// Don't edit below — auto-detects whether cloud sync is configured.
export const USE_FIREBASE =
  !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE");
