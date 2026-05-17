/**
 * App bootstrap.
 *
 *  1. Load persisted settings (URL, token, theme, debug).
 *  2. Build the global store + event bus + WS client + commands.
 *  3. Mount layout (sidebar, topbar, bottom nav, toast host).
 *  4. Start the router with all five pages.
 *  5. Wire global signals (theme:set, toast:show, ha:ready data load).
 *  6. Auto-connect if credentials exist.
 *
 * Everything exported on `window.__dasher` for ad-hoc debugging in devtools.
 */
import { eventBus } from "./core/event-bus.js";
import { storage, STORAGE_KEYS } from "./core/storage.js";
import { logger } from "./core/logger.js";
import { t } from "./core/i18n.js";

import { Store, initialState } from "./state/store.js";
import { HAWebSocketClient } from "./api/ha-ws.js";
import { HACommands } from "./api/ha-commands.js";
import { HAAuth } from "./api/ha-auth.js";

import { Router } from "./router.js";
import { TopBar } from "./components/layout/TopBar.js";
import { SideBar } from "./components/layout/SideBar.js";
import { BottomNav } from "./components/layout/BottomNav.js";

import { Overview } from "./pages/Overview.js";
import { RoomPage } from "./pages/RoomPage.js";
import { MusicPage } from "./pages/MusicPage.js";
import { CarPage } from "./pages/CarPage.js";
import { PartyPage } from "./pages/PartyPage.js";
import { Settings } from "./pages/Settings.js";
import { LoginPage } from "./pages/LoginPage.js";

// -------- 1. Settings ------------------------------------------------------

const baseUrl       = storage.get(STORAGE_KEYS.BASE_URL, "");
let   token         = storage.get(STORAGE_KEYS.TOKEN, "");
let   refreshToken  = storage.get(STORAGE_KEYS.REFRESH_TOKEN, "");
let   tokenExpAt    = Number(storage.get(STORAGE_KEYS.TOKEN_EXPIRES_AT, 0)) || 0;
const theme         = storage.get(STORAGE_KEYS.THEME, "dark");
const logLevel      = storage.get(STORAGE_KEYS.LOG_LEVEL, "warn");

logger.setLevel(logLevel);

// -------- 2. Core services -------------------------------------------------

const store = new Store({
  ...initialState,
  settings: { baseUrl, token },
  theme,
  debug: logLevel === "debug",
});

applyTheme(theme);

const ws = new HAWebSocketClient({ url: baseUrl, token, eventBus, store });
const commands = new HACommands(ws);
const auth = new HAAuth({ baseUrl });

// -------- 3. Layout --------------------------------------------------------

const sidebarEl   = document.getElementById("app-sidebar");
const topbarEl    = document.getElementById("app-topbar");
const outletEl    = document.getElementById("app-outlet");
const bottomNavEl = document.getElementById("app-bottomnav");
const toastsEl    = document.getElementById("app-toasts");

new SideBar({ eventBus }).mount(sidebarEl);
new TopBar({ store, eventBus }).mount(topbarEl);
new BottomNav({ eventBus }).mount(bottomNavEl);

// -------- 4. Router --------------------------------------------------------

const router = new Router({
  outlet: outletEl,
  defaultPath: "/oversigt",
  notFound: Overview,
  context: { store, ws, commands, eventBus },
  routes: {
    "/oversigt":      Overview,
    "/rum/:areaId":   RoomPage,
    "/musik":         MusicPage,
    "/bil":           CarPage,
    "/fest":          PartyPage,
    "/indstillinger": Settings,
  },
});
router.start();

// -------- 5. Global signals ------------------------------------------------

// Theme persistence + body data-theme application.
eventBus.on("theme:set", (next) => {
  store.setTheme(next);
  storage.set(STORAGE_KEYS.THEME, next);
  applyTheme(next);
});

// Toast renderer.
eventBus.on("toast:show", ({ message, tone = "info", duration = 3200 }) => {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.tone = tone;
  toast.textContent = message;
  toastsEl.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, duration);
});

// On (re)connect: load areas, registry, then states, and subscribe.
let unsubStateChanges = null;
eventBus.on("ha:ready", async () => {
  try {
    // Drop previous state subscription if reconnecting.
    if (unsubStateChanges) { try { unsubStateChanges(); } catch { /* ignore */ } unsubStateChanges = null; }

    const [areas, registry, devices, states] = await Promise.all([
      commands.getAreas().catch(() => []),
      commands.getEntityRegistry().catch(() => []),
      commands.getDeviceRegistry().catch(() => []),
      commands.getStates(),
    ]);
    store.setAreas(areas);
    store.setEntityAreaMap(registry, devices);
    store.setEntities(states);
    store.setReady(true);

    unsubStateChanges = await commands.subscribeStateChanges((ev) => {
      store.applyStateChange(ev.data ?? ev);
    });

    logger.info("[app] bootstrap complete:", states.length, "entities,", areas.length, "areas");
  } catch (err) {
    logger.error("[app] bootstrap failed", err);
    eventBus.emit("toast:show", { message: `Kunne ikke hente data: ${err.message}`, tone: "error" });
  }
});

// Surface auth/connection errors as toasts (once).
eventBus.on("ha:status", ({ status, message }) => {
  if (status === "error" && message) {
    eventBus.emit("toast:show", { message, tone: "error" });
  }
});

// -------- 6. Auto-connect / login gate ------------------------------------

let currentLogin = null;
let refreshInFlight = null;
let pendingLoginError = "";

bootstrapAuth();

async function bootstrapAuth() {
  // 0) Hvis vi kommer tilbage fra HA's login (?code=...), byt koden til
  //    tokens f\u00f8r vi g\u00f8r noget andet.
  if (HAAuth.hasPendingCallback()) {
    try {
      const result = await auth.handleRedirectCallback();
      if (result) {
        const { baseUrl: cbUrl, tokens } = result;
        token        = tokens.access_token;
        refreshToken = tokens.refresh_token || "";
        tokenExpAt   = tokens.expires_at || 0;
        storage.set(STORAGE_KEYS.BASE_URL, cbUrl);
        storage.set(STORAGE_KEYS.TOKEN, token);
        if (refreshToken) {
          storage.set(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
          storage.set(STORAGE_KEYS.TOKEN_EXPIRES_AT, tokenExpAt);
        }
        store.setSettings({ baseUrl: cbUrl, token });
        ws.setCredentials({ url: cbUrl, token });
      }
    } catch (err) {
      logger.warn("[app] redirect callback failed", err);
      pendingLoginError = err?.message || "Login fejlede.";
    }
  }

  // 1) Hvis access-token er udl\u00f8bet og vi har et refresh-token, forny.
  const effectiveBase = storage.get(STORAGE_KEYS.BASE_URL, "");
  if (effectiveBase && refreshToken && (!token || isExpired(tokenExpAt))) {
    try {
      await refreshAccessToken(effectiveBase);
    } catch (err) {
      logger.warn("[app] token refresh failed on boot", err);
    }
  }

  if (effectiveBase && token) {
    ws.connect();
  } else {
    store.setConnection({ status: "idle", message: "Log ind p\u00e5 Home Assistant." });
    showLogin();
  }
}

function isExpired(ts) {
  if (!ts) return true;
  return Date.now() > ts - 60_000;
}

async function refreshAccessToken(forBaseUrl) {
  if (!refreshToken) throw new Error(t("No refresh token."));
  if (refreshInFlight) return refreshInFlight;
  const url = forBaseUrl || storage.get(STORAGE_KEYS.BASE_URL, "");
  auth.setBaseUrl(url);
  refreshInFlight = (async () => {
    const t = await auth.refresh(refreshToken);
    token = t.access_token;
    refreshToken = t.refresh_token || refreshToken;
    tokenExpAt = t.expires_at;
    storage.set(STORAGE_KEYS.TOKEN, token);
    storage.set(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
    storage.set(STORAGE_KEYS.TOKEN_EXPIRES_AT, tokenExpAt);
    store.setSettings({ baseUrl: url, token });
    ws.setCredentials({ url, token });
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

// Hvis HA afviser token (auth_invalid -> status "error") pr\u00f8ver vi f\u00f8rst et
// stille refresh; lykkes det ikke, vis login.
eventBus.on("ha:status", async ({ status, message }) => {
  if (status !== "error" || !/auth/i.test(message || "")) return;
  if (currentLogin) return;
  if (refreshToken) {
    try {
      await refreshAccessToken();
      ws.reconnectNow();
      return;
    } catch (err) {
      logger.warn("[app] silent refresh failed", err);
    }
  }
  showLogin();
});

// Lyt p\u00e5 "auth:logout" fra Indstillinger.
eventBus.on("auth:logout", async () => {
  ws.disconnect();
  // Best-effort revoke s\u00e5 refresh token ikke kan genbruges.
  if (refreshToken) {
    try { await auth.revoke?.(refreshToken); } catch { /* ignore */ }
  }
  storage.remove(STORAGE_KEYS.TOKEN);
  storage.remove(STORAGE_KEYS.BASE_URL);
  storage.remove(STORAGE_KEYS.REFRESH_TOKEN);
  storage.remove(STORAGE_KEYS.TOKEN_EXPIRES_AT);
  token = "";
  refreshToken = "";
  tokenExpAt = 0;
  store.setSettings({ baseUrl: "", token: "" });
  store.resetHAData();
  showLogin();
});

function showLogin() {
  if (currentLogin) return;
  const settings = store.getState().settings || {};
  const startError = pendingLoginError;
  pendingLoginError = "";
  currentLogin = new LoginPage({
    initial: { baseUrl: settings.baseUrl, token: settings.token },
    mode: "redirect",
    error: startError,
    /**
     * Redirect-flow: gem URL og send brugeren til HA's egen login-side.
     * Browseren navigerer v\u00e6k \u2014 callback h\u00e5ndteres i bootstrapAuth().
     */
    onAuthorize: async ({ baseUrl: url }) => {
      storage.set(STORAGE_KEYS.BASE_URL, url);
      auth.setBaseUrl(url);
      auth.beginAuthorize();
    },
    /**
     * Fallback: access-token mode. Modtager {mode:"token", baseUrl, token}.
     */
    onSubmit: async (payload) => {
      storage.set(STORAGE_KEYS.BASE_URL, payload.baseUrl);
      storage.set(STORAGE_KEYS.TOKEN, payload.token);
      storage.remove(STORAGE_KEYS.REFRESH_TOKEN);
      storage.remove(STORAGE_KEYS.TOKEN_EXPIRES_AT);
      token = payload.token;
      refreshToken = "";
      tokenExpAt = 0;

      store.setSettings({ baseUrl: payload.baseUrl, token: payload.token });
      ws.setCredentials({ url: payload.baseUrl, token: payload.token });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error(t("Timeout — no response from Home Assistant.")));
        }, 10_000);
        const offReady  = eventBus.on("ha:ready", () => { cleanup(); resolve(); });
        const offStatus = eventBus.on("ha:status", ({ status, message }) => {
          if (status === "error") { cleanup(); reject(new Error(message || t("Connection failed."))); }
        });
        function cleanup() { clearTimeout(timeout); offReady?.(); offStatus?.(); }
        ws.reconnectNow();
      });
    },
    onSuccess: () => {
      currentLogin?.unmount();
      currentLogin = null;
      if (!window.location.hash || window.location.hash === "#/indstillinger") {
        window.location.hash = "/oversigt";
      }
    },
  });
  currentLogin.mount(document.body);
}

// -------- helpers ----------------------------------------------------------

function applyTheme(t) {
  document.body.dataset.theme = t;
}

// Devtools handle.
window.__dasher = { store, ws, commands, eventBus, router, logger };
