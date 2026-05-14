import test from "node:test";
import assert from "node:assert/strict";
import { buildWebSocketUrl, mapEntityStates } from "../src/ha-client.mjs";

test("buildWebSocketUrl converts HTTP URL to WS endpoint", () => {
  assert.equal(buildWebSocketUrl("http://homeassistant.local:8123"), "ws://homeassistant.local:8123/api/websocket");
});

test("buildWebSocketUrl converts HTTPS URL to WSS endpoint", () => {
  assert.equal(buildWebSocketUrl("https://example.com/"), "wss://example.com/api/websocket");
});

test("mapEntityStates prefers friendly names and sorts labels", () => {
  const result = mapEntityStates([
    { entity_id: "light.kitchen", state: "on", attributes: { friendly_name: "Kitchen" } },
    { entity_id: "sensor.outside_temp", state: "19", attributes: {} },
  ]);

  assert.deepEqual(result, [
    { entityId: "light.kitchen", label: "Kitchen", state: "on" },
    { entityId: "sensor.outside_temp", label: "sensor.outside_temp", state: "19" },
  ]);
});
