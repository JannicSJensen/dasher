import test from "node:test";
import assert from "node:assert/strict";
import { buildWebSocketUrl, connectToHomeAssistant, mapEntityStates, parseWebSocketMessage } from "../src/ha-client.mjs";

test("buildWebSocketUrl converts HTTP URL to WS endpoint", () => {
  assert.equal(buildWebSocketUrl("http://homeassistant.local:8123"), "ws://homeassistant.local:8123/api/websocket");
});

test("buildWebSocketUrl converts HTTPS URL to WSS endpoint", () => {
  assert.equal(buildWebSocketUrl("https://example.com/"), "wss://example.com/api/websocket");
});

test("mapEntityStates prefers friendly names and sorts labels", () => {
  const result = mapEntityStates([
    { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen" } },
    { entity_id: "alarm_control_panel.home", state: "armed", attributes: { friendly_name: "Alarm" } },
    { entity_id: "sensor.outside_temp", state: "19", attributes: {} },
  ]);

  assert.deepEqual(result, [
    { entityId: "alarm_control_panel.home", label: "Alarm", state: "armed" },
    { entityId: "light.kitchen", label: "Kitchen", state: "on" },
    { entityId: "sensor.outside_temp", label: "sensor.outside_temp", state: "19" },
  ]);
});

test("parseWebSocketMessage returns undefined for malformed payloads", () => {
  assert.equal(parseWebSocketMessage("{not-json"), undefined);
});

test("connectToHomeAssistant authenticates and loads states", (t) => {
  class FakeWebSocket {
    static instances = [];

    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.sent = [];
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type, callback) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(callback);
    }

    emit(type, event = {}) {
      for (const callback of this.listeners[type] || []) {
        callback(event);
      }
    }

    send(payload) {
      this.sent.push(payload);
    }

    close() {}
  }

  const previousWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => {
    globalThis.WebSocket = previousWebSocket;
  });

  const statuses = [];
  const entitiesEvents = [];
  const errors = [];

  connectToHomeAssistant({
    baseUrl: "http://homeassistant.local:8123",
    token: "abc123",
    onStatus: (message) => statuses.push(message),
    onEntities: (entities) => entitiesEvents.push(entities),
    onError: (message) => errors.push(message),
  });

  const socket = FakeWebSocket.instances[0];
  socket.emit("open");
  socket.emit("message", { data: JSON.stringify({ type: "auth_required" }) });
  socket.emit("message", { data: JSON.stringify({ type: "auth_ok" }) });
  socket.emit("message", {
    data: JSON.stringify({
      type: "result",
      id: 1,
      result: [{ entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen" } }],
    }),
  });

  assert.deepEqual(socket.sent, [
    JSON.stringify({ type: "auth", access_token: "abc123" }),
    JSON.stringify({ id: 1, type: "get_states" }),
  ]);
  assert.deepEqual(entitiesEvents, [[{ entityId: "light.kitchen", label: "Kitchen", state: "on" }]]);
  assert.deepEqual(errors, []);
  assert.equal(statuses.at(-1), "Connected.");
});

test("connectToHomeAssistant reports auth failures and closes socket", (t) => {
  class FakeWebSocket {
    static instances = [];

    constructor() {
      this.listeners = {};
      this.closed = false;
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type, callback) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(callback);
    }

    emit(type, event = {}) {
      for (const callback of this.listeners[type] || []) {
        callback(event);
      }
    }

    send() {}

    close() {
      this.closed = true;
    }
  }

  const previousWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket;
  t.after(() => {
    globalThis.WebSocket = previousWebSocket;
  });

  const errors = [];

  connectToHomeAssistant({
    baseUrl: "http://homeassistant.local:8123",
    token: "abc123",
    onStatus: () => {},
    onEntities: () => {},
    onError: (message) => errors.push(message),
  });

  const socket = FakeWebSocket.instances[0];
  socket.emit("message", { data: JSON.stringify({ type: "auth_invalid", message: "Invalid access token" }) });

  assert.equal(errors[0], "Invalid access token");
  assert.equal(socket.closed, true);
});
