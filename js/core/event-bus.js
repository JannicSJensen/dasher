/**
 * Tiny pub/sub event bus.
 *
 * Used for transient, cross-cutting signals that don't belong in the
 * store (e.g. "toast:show", "ha:reconnecting", "party:toggle").
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._map = new Map();
  }

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {() => void}
   */
  on(event, handler) {
    if (!this._map.has(event)) this._map.set(event, new Set());
    this._map.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /** Unsubscribe a previously registered handler. */
  off(event, handler) {
    this._map.get(event)?.delete(handler);
  }

  /** Fire an event. Handler errors are isolated. */
  emit(event, payload) {
    const set = this._map.get(event);
    if (!set) return;
    for (const handler of set) {
      try { handler(payload); } catch (err) { console.error(`[event-bus] ${event}`, err); }
    }
  }

  /** Remove all subscribers (useful in tests). */
  clear() { this._map.clear(); }
}

/** Shared default instance for the app. */
export const eventBus = new EventBus();
