/**
 * Typed wrappers around HAWebSocketClient.sendMessage().
 *
 * Pages and components should use these helpers — never build raw HA
 * messages inline. This keeps domain knowledge in one place and makes
 * mocking easy.
 */
export class HACommands {
  /** @param {import("./ha-ws.js").HAWebSocketClient} client */
  constructor(client) {
    this.client = client;
  }

  // ---- Bootstrap data ----------------------------------------------------

  /** Fetch all entity states in one shot. */
  getStates() {
    return this.client.sendMessage({ type: "get_states" });
  }

  /** Area registry list (rooms). */
  getAreas() {
    return this.client.sendMessage({ type: "config/area_registry/list" });
  }

  /** Entity registry list (gives entity → area_id mapping). */
  getEntityRegistry() {
    return this.client.sendMessage({ type: "config/entity_registry/list" });
  }

  /** Device registry list (entities inherit area from their device). */
  getDeviceRegistry() {
    return this.client.sendMessage({ type: "config/device_registry/list" });
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribeStateChanges(handler) {
    return this.client.subscribeEvents("state_changed", handler);
  }

  // ---- Generic ------------------------------------------------------------

  /**
   * Generic service call.
   * @param {string} domain        e.g. "light"
   * @param {string} service       e.g. "turn_on"
   * @param {object} [serviceData] e.g. { brightness: 200 }
   * @param {object} [target]      e.g. { entity_id: "light.kitchen" }
   */
  callService(domain, service, serviceData = {}, target = undefined) {
    return this.client.sendMessage({
      type: "call_service",
      domain,
      service,
      service_data: serviceData,
      target,
    });
  }

  // ---- Lights -------------------------------------------------------------

  lightTurnOn(entityId, data = {}) {
    return this.callService("light", "turn_on", data, { entity_id: entityId });
  }
  lightTurnOff(entityId) {
    return this.callService("light", "turn_off", {}, { entity_id: entityId });
  }
  lightToggle(entityId) {
    return this.callService("light", "toggle", {}, { entity_id: entityId });
  }
  lightSetBrightnessPct(entityId, pct) {
    return this.lightTurnOn(entityId, { brightness_pct: pct });
  }

  // ---- Switches -----------------------------------------------------------

  switchToggle(entityId) {
    return this.callService("switch", "toggle", {}, { entity_id: entityId });
  }

  // ---- Media players ------------------------------------------------------

  mediaPlay(entityId)  { return this.callService("media_player", "media_play",       {}, { entity_id: entityId }); }
  mediaPause(entityId) { return this.callService("media_player", "media_pause",      {}, { entity_id: entityId }); }
  mediaNext(entityId)  { return this.callService("media_player", "media_next_track", {}, { entity_id: entityId }); }
  mediaPrev(entityId)  { return this.callService("media_player", "media_previous_track", {}, { entity_id: entityId }); }
  mediaVolume(entityId, level) {
    return this.callService("media_player", "volume_set", { volume_level: level }, { entity_id: entityId });
  }

  // ---- Locks --------------------------------------------------------------

  lock(entityId)   { return this.callService("lock", "lock",   {}, { entity_id: entityId }); }
  unlock(entityId) { return this.callService("lock", "unlock", {}, { entity_id: entityId }); }

  // ---- Scenes / scripts ---------------------------------------------------

  sceneActivate(entityId) {
    return this.callService("scene", "turn_on", {}, { entity_id: entityId });
  }
  scriptRun(entityId) {
    return this.callService("script", "turn_on", {}, { entity_id: entityId });
  }

  // ---- Misc ---------------------------------------------------------------

  turnAllLightsOff() {
    return this.callService("light", "turn_off", {}, { entity_id: "all" });
  }
}
