import { logger } from "../core/logger.js";
import { t } from "../core/i18n.js";

/**
 * Home Assistant WebSocket client.
 *
 *   const ws = new HAWebSocketClient({ url, token, eventBus });
 *   ws.on("ready", () => ws.sendMessage({ type: "get_states" }).then(...));
 *   ws.connect();
 *
 * Responsibilities:
 *  - Build wss:// URL from a base URL.
 *  - Run the auth handshake (auth_required → auth → auth_ok / auth_invalid).
 *  - Generate unique integer message ids.
 *  - Track pending requests (id → { resolve, reject }) so callers get
 *    Promises that resolve with the matching `result` payload.
 *  - Auto-reconnect with exponential backoff + jitter (capped).
 *  - Re-emit a "ready" event after each successful (re)connect so higher
 *    layers can re-subscribe / re-sync.
 *  - Update connection status via the event bus and the optional `store`.
 *
 * Connection states ("status"):
 *   "idle" | "connecting" | "connected" | "reconnecting" | "error" | "offline"
 */
export class HAWebSocketClient {
  constructor({ url, token, eventBus, store, WebSocketImpl } = {}) {
    this.url = url || "";
    this.token = token || "";
    this.eventBus = eventBus;
    this.store = store;
    this.WebSocketImpl = WebSocketImpl ?? globalThis.WebSocket;

    /** @type {WebSocket | null} */
    this.ws = null;

    /** Auto-incrementing message id (HA requires positive ints, monotonic). */
    this._nextId = 1;

    /** id → { resolve, reject } */
    this._pending = new Map();

    /** Queued outbound messages while disconnected. */
    this._queue = [];

    /** Reconnect bookkeeping. */
    this._shouldReconnect = true;
    this._retryAttempt = 0;
    this._reconnectTimer = null;

    /** Subscriptions for state_changed etc. — id → handler (set after subscribe). */
    this._subscriptions = new Map();

    this._authenticated = false;
    this._status = "idle";
  }

  // -------- public API --------------------------------------------------

  setCredentials({ url, token }) {
    if (url !== undefined) this.url = url;
    if (token !== undefined) this.token = token;
  }

  /** Compute the websocket endpoint for the configured base URL. */
  endpoint() {
    const normalized = String(this.url || "").trim().replace(/\/+$/, "");
    if (!normalized) throw new Error("Home Assistant URL is required.");
    const parsed = new URL(normalized);
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${parsed.host}/api/websocket`;
  }

  /** Open the socket. Safe to call multiple times. */
  connect() {
    if (this.ws) this._teardownSocket();
    if (!this.url || !this.token) {
      this._setStatus("idle", "Configure URL and token in Settings.");
      return;
    }

    this._shouldReconnect = true;
    let endpoint;
    try {
      endpoint = this.endpoint();
    } catch (err) {
      this._setStatus("error", err.message);
      return;
    }

    this._setStatus(this._retryAttempt > 0 ? "reconnecting" : "connecting",
                    this._retryAttempt > 0 ? t("Reconnecting (attempt {n})...", { n: this._retryAttempt }) : "Connecting...");

    logger.debug("[ha-ws] connecting to", endpoint);
    try {
      this.ws = new this.WebSocketImpl(endpoint);
    } catch (err) {
      this._setStatus("error", t("Could not open socket: {msg}", { msg: err.message }));
      this._scheduleReconnect();
      return;
    }

    this.ws.addEventListener("open",    () => this._onOpen());
    this.ws.addEventListener("message", (e) => this._onMessage(e));
    this.ws.addEventListener("error",   () => this._onError());
    this.ws.addEventListener("close",   (e) => this._onClose(e));
  }

  /** Close the socket and stop trying to reconnect. */
  disconnect({ silent = false } = {}) {
    this._shouldReconnect = false;
    this._clearReconnectTimer();
    this._teardownSocket();
    this._authenticated = false;
    if (!silent) this._setStatus("offline", "Disconnected.");
  }

  /** Manually trigger a reconnect right now (skips the backoff timer). */
  reconnectNow() {
    logger.info("[ha-ws] manual reconnect requested");
    this._retryAttempt = 0;
    this._clearReconnectTimer();
    this._teardownSocket();
    this.connect();
  }

  /**
   * Send a typed JSON message and resolve when HA replies with a matching
   * `result`. If we're disconnected the message is queued until we are
   * authenticated again.
   *
   * @param {object} message  Payload (without `id`); an id is auto-assigned.
   * @returns {Promise<any>}
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      const payload = { id, ...message };
      this._pending.set(id, { resolve, reject, message: payload });

      if (this._authenticated && this.ws?.readyState === 1 /* OPEN */) {
        this._rawSend(payload);
      } else {
        // Queue. Will flush once authenticated.
        this._queue.push(payload);
        logger.debug("[ha-ws] queued (not connected)", payload.type);
      }
    });
  }

  /**
   * Subscribe to an HA event stream (e.g. "state_changed"). The handler
   * is called for every incoming event; the returned promise resolves
   * with an unsubscribe function.
   */
  async subscribeEvents(eventType, handler) {
    const id = this._nextId++;
    this._subscriptions.set(id, handler);
    this._pending.set(id, {
      resolve: () => {},
      reject: (err) => { this._subscriptions.delete(id); throw err; },
      message: { id, type: "subscribe_events", event_type: eventType },
    });
    this._rawSend({ id, type: "subscribe_events", event_type: eventType });

    return () => {
      this._subscriptions.delete(id);
      // Best-effort unsubscribe. Errors are non-fatal.
      this.sendMessage({ type: "unsubscribe_events", subscription: id }).catch(() => {});
    };
  }

  /** Convenience: register a one-off listener for client lifecycle events. */
  on(event, handler) {
    return this.eventBus?.on(`ha:${event}`, handler);
  }

  // -------- internals ---------------------------------------------------

  _rawSend(payload) {
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      logger.warn("[ha-ws] send failed", err);
    }
  }

  _onOpen() {
    logger.debug("[ha-ws] socket open, awaiting auth_required");
    this._setStatus("connecting", "Waiting for authentication...");
  }

  _onMessage(event) {
    let message;
    try { message = JSON.parse(event.data); }
    catch (err) { logger.warn("[ha-ws] malformed message", err); return; }

    // Auth handshake
    if (message.type === "auth_required") {
      this._rawSend({ type: "auth", access_token: this.token });
      this._setStatus("connecting", "Authenticating...");
      return;
    }
    if (message.type === "auth_ok") {
      this._authenticated = true;
      this._retryAttempt = 0;
      this._setStatus("connected", "Connected.");
      this._flushQueue();
      this.eventBus?.emit("ha:ready");
      return;
    }
    if (message.type === "auth_invalid") {
      const msg = message.message || "Authentication failed.";
      this._setStatus("error", msg);
      this.eventBus?.emit("toast:show", { message: msg, tone: "error" });
      this._shouldReconnect = false;
      this._teardownSocket();
      return;
    }

    // Result correlation
    if (message.type === "result") {
      const pending = this._pending.get(message.id);
      if (pending) {
        if (message.success === false) {
          pending.reject(new Error(message.error?.message || "HA request failed"));
        } else {
          pending.resolve(message.result);
        }
        // Keep subscription entries; they receive future "event" messages.
        if (!this._subscriptions.has(message.id)) {
          this._pending.delete(message.id);
        }
      }
      return;
    }

    // Subscription events
    if (message.type === "event") {
      const handler = this._subscriptions.get(message.id);
      if (handler) handler(message.event);
    }
  }

  _onError() {
    logger.warn("[ha-ws] socket error");
    this.eventBus?.emit("ha:error", "WebSocket error");
  }

  _onClose(event) {
    logger.info("[ha-ws] socket closed", event?.code, event?.reason);
    this._authenticated = false;
    this.ws = null;

    // Reject all pending non-subscription requests so callers don't hang.
    for (const [id, pending] of this._pending) {
      if (!this._subscriptions.has(id)) {
        pending.reject(new Error("WebSocket closed"));
        this._pending.delete(id);
      }
    }

    if (!this._shouldReconnect) {
      this._setStatus("offline", "Disconnected.");
      return;
    }
    this._scheduleReconnect();
  }

  _scheduleReconnect() {
    this._clearReconnectTimer();
    this._retryAttempt += 1;

    // Exponential backoff with jitter, capped at 30s.
    const base = 500;                   // 500ms base
    const cap  = 30_000;                // 30s ceiling
    const exp  = Math.min(cap, base * 2 ** (this._retryAttempt - 1));
    const jitter = Math.random() * exp * 0.3;
    const delay = Math.round(exp + jitter);

    this._setStatus("reconnecting", t("Reconnecting in {s}s (attempt {n})", { s: (delay / 1000).toFixed(1), n: this._retryAttempt }));
    logger.info(`[ha-ws] reconnect in ${delay}ms (attempt ${this._retryAttempt})`);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
    }, delay);
  }

  _clearReconnectTimer() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _teardownSocket() {
    if (!this.ws) return;
    try { this.ws.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  _flushQueue() {
    const pending = this._queue;
    this._queue = [];
    for (const msg of pending) this._rawSend(msg);
  }

  _setStatus(status, message) {
    this._status = status;
    this.eventBus?.emit("ha:status", { status, message });
    if (this.store?.setConnection) this.store.setConnection({ status, message });
  }
}
