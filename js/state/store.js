/**
 * Global reactive store.
 *
 * - One source of truth for connection state, settings, theme, and HA data.
 * - `setState(patch)` accepts a shallow object patch or a (state) => state updater.
 * - `subscribe(selector, handler)` only fires when the selector returns a new
 *   reference, which keeps re-renders cheap.
 * - All HA-specific mutations go through the named action methods at the
 *   bottom (setEntities, applyStateChange, ...). Components never poke
 *   `state.entities` directly.
 *
 * The shape of `state` is documented in `initialState` below.
 */

export const initialState = Object.freeze({
  // ---- Connection ----
  connection: { status: "idle", message: "Disconnected." },

  // ---- Settings (mirrors localStorage) ----
  settings: { baseUrl: "", token: "" },

  // ---- UI ----
  theme: "dark",       // "dark" | "light" | "party"
  debug: false,        // toggles logger.setLevel("debug")

  // ---- HA data ----
  entities:    {},     // entityId → { entityId, label, state, attributes, lastChanged }
  areas:       {},     // areaId → { id, name }
  entityArea:  {},     // entityId → areaId | null
  entityDevice:{},     // entityId → deviceId | null
  devices:     {},     // deviceId → { id, name, area_id }
  ready:       false,  // bootstrap finished (states + areas + registry loaded)
});

export class Store {
  constructor(initial = initialState) {
    this.state = initial;
    /** @type {Set<{ _notify: (s: any) => void }>} */
    this._subs = new Set();
  }

  // -------- core API ---------------------------------------------------

  getState() { return this.state; }

  setState(patch) {
    const next = typeof patch === "function"
      ? patch(this.state)
      : { ...this.state, ...patch };
    if (next === this.state) return;
    this.state = next;
    for (const sub of this._subs) sub._notify(this.state);
  }

  /**
   * Subscribe to a selected slice. Handler fires on initial change only
   * when the selector returns a *new* reference.
   * @template T
   * @param {(s: any) => T} selector
   * @param {(value: T) => void} handler
   * @returns {() => void} unsubscribe
   */
  subscribe(selector, handler) {
    let last = selector(this.state);
    const sub = {
      _notify: (state) => {
        const next = selector(state);
        if (next !== last) {
          last = next;
          handler(next);
        }
      },
    };
    this._subs.add(sub);
    return () => this._subs.delete(sub);
  }

  // -------- typed actions (use these from services / pages) ------------

  setConnection({ status, message }) {
    this.setState((s) => ({ ...s, connection: { status, message: message ?? s.connection.message } }));
  }

  setSettings(partial) {
    this.setState((s) => ({ ...s, settings: { ...s.settings, ...partial } }));
  }

  setTheme(theme)  { this.setState({ theme }); }
  setDebug(debug)  { this.setState({ debug: !!debug }); }

  setReady(ready)  { this.setState({ ready: !!ready }); }

  /** Replace the whole entity map from a `get_states` result. */
  setEntities(states = []) {
    const map = {};
    for (const s of states) map[s.entity_id] = entityFromState(s);
    this.setState({ entities: map });
  }

  /** Replace the area registry. */
  setAreas(areas = []) {
    const map = {};
    for (const a of areas) {
      if (!a?.area_id || !a?.name) continue;
      map[a.area_id] = { id: a.area_id, name: a.name };
    }
    this.setState({ areas: map });
  }

  /** Replace entity → area map from the entity + device registry.
   *  Entities without `area_id` inherit area from their device.
   *  Also stores entity→device map and the device registry for grouping UIs.
   */
  setEntityAreaMap(registry = [], devices = []) {
    const deviceArea = {};
    const deviceMap  = {};
    for (const d of devices) {
      if (!d?.id) continue;
      deviceArea[d.id] = d.area_id ?? null;
      deviceMap[d.id]  = {
        id:      d.id,
        name:    d.name_by_user || d.name || d.id,
        area_id: d.area_id ?? null,
      };
    }
    const areaByEntity   = {};
    const deviceByEntity = {};
    for (const entry of registry) {
      if (!entry?.entity_id) continue;
      const direct = entry.area_id ?? null;
      const inherited = entry.device_id ? (deviceArea[entry.device_id] ?? null) : null;
      areaByEntity[entry.entity_id]   = direct || inherited || null;
      deviceByEntity[entry.entity_id] = entry.device_id ?? null;
    }
    this.setState({
      entityArea:   areaByEntity,
      entityDevice: deviceByEntity,
      devices:      deviceMap,
    });
  }

  /** Apply a single `state_changed` event. */
  applyStateChange(eventData) {
    const newState = eventData?.new_state;
    if (!newState?.entity_id) return;
    this.setState((s) => ({
      ...s,
      entities: { ...s.entities, [newState.entity_id]: entityFromState(newState) },
    }));
  }

  /** Wipe the HA dataset (e.g. on logout / settings change). */
  resetHAData() {
    this.setState((s) => ({ ...s, entities: {}, areas: {}, entityArea: {}, entityDevice: {}, devices: {}, ready: false }));
  }
}

// -------- helpers ------------------------------------------------------

function entityFromState(s) {
  return {
    entityId: s.entity_id,
    label: s.attributes?.friendly_name ?? s.entity_id,
    state: s.state,
    attributes: s.attributes ?? {},
    lastChanged: s.last_changed ?? null,
  };
}

// -------- canonical selectors ------------------------------------------

export const selectConnection = (s) => s.connection;
export const selectSettings   = (s) => s.settings;
export const selectTheme      = (s) => s.theme;
export const selectDebug      = (s) => s.debug;
export const selectReady      = (s) => s.ready;
export const selectEntities   = (s) => s.entities;
export const selectAreas      = (s) => s.areas;
export const selectEntityArea = (s) => s.entityArea;
