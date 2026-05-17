/**
 * Typed localStorage wrapper.
 *
 * - Namespaces keys under `dasher.*` to avoid collisions.
 * - JSON-encodes values so booleans/numbers/objects round-trip.
 * - Safe to call in non-browser environments (e.g. node tests): all
 *   methods become no-ops if `localStorage` isn't available.
 */
const PREFIX = "dasher.";

function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch { return false; }
}

function fullKey(key) {
  if (typeof key !== "string" || !key) return null;
  return key.startsWith(PREFIX) ? key : PREFIX + key;
}

export const storage = {
  /** Read a value, returning `fallback` if missing or invalid. */
  get(key, fallback = null) {
    if (!hasStorage()) return fallback;
    const k = fullKey(key);
    if (!k) return fallback;
    const raw = window.localStorage.getItem(k);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  },

  /** Write a JSON-serializable value. */
  set(key, value) {
    if (!hasStorage()) return;
    const k = fullKey(key);
    if (!k) return;
    try { window.localStorage.setItem(k, JSON.stringify(value)); }
    catch (err) { console.warn("[storage] failed to set", key, err); }
  },

  /** Remove a value. */
  remove(key) {
    if (!hasStorage()) return;
    const k = fullKey(key);
    if (!k) return;
    window.localStorage.removeItem(k);
  },

  /** Remove every dasher-namespaced value. */
  clearAll() {
    if (!hasStorage()) return;
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => window.localStorage.removeItem(k));
  },
};

/** Canonical storage keys used across the app. */
export const STORAGE_KEYS = Object.freeze({
  BASE_URL: "baseUrl",
  TOKEN: "token",
  REFRESH_TOKEN: "refreshToken",
  TOKEN_EXPIRES_AT: "tokenExpiresAt",
  THEME: "theme",
  LOG_LEVEL: "logLevel",
  OVERSIGT_HIDDEN_ROOMS:    "oversigt.hiddenRooms",
  OVERSIGT_HIDDEN_WASTE:    "oversigt.hiddenWaste",
  OVERSIGT_HIDDEN_ALARM:    "oversigt.hiddenAlarm",
  OVERSIGT_HIDDEN_FAVS:     "oversigt.hiddenFavorites",
  OVERSIGT_HIDDEN_CALENDAR: "oversigt.hiddenCalendar",
  OVERSIGT_ROOM_ENTITIES:   "oversigt.roomEntities",
  MUSIK_HIDDEN_DEVICES:     "musik.hiddenDevices",
  MUSIK_STATE_FILTER:       "musik.stateFilter",
  MUSIK_LAYOUT:             "musik.layout",
  LANGUAGE:                 "language",
  SIDEBAR_LABELS:           "sidebar.labels",
});
