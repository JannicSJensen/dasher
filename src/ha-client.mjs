const GET_STATES_REQUEST_ID = 1;
const GET_AREAS_REQUEST_ID = 2;
const GET_ENTITY_REGISTRY_REQUEST_ID = 3;

export function buildWebSocketUrl(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Home Assistant URL is required.");
  }

  const parsed = new URL(normalized);
  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${parsed.host}/api/websocket`;
}

export function mapEntityStates(states) {
  return states
    .map((state) => ({
      entityId: state.entity_id,
      label: state.attributes?.friendly_name ?? state.entity_id,
      state: state.state,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function mapRoomsDashboard({ states, areas, entityRegistry }) {
  const areaNameById = new Map(
    areas.map((area) => [area.area_id, area.name]).filter(([areaId]) => typeof areaId === "string"),
  );

  const areaByEntityId = new Map(
    entityRegistry
      .map((entry) => [entry.entity_id, entry.area_id])
      .filter(([entityId, areaId]) => typeof entityId === "string" && typeof areaId === "string"),
  );

  const roomMap = new Map();
  for (const area of areas) {
    if (!area?.area_id || !area?.name) {
      continue;
    }

    roomMap.set(area.area_id, {
      id: area.area_id,
      name: area.name,
      entities: [],
    });
  }

  const entityStates = mapEntityStates(states);
  for (const entity of entityStates) {
    const areaId = areaByEntityId.get(entity.entityId) ?? "unassigned";
    if (!roomMap.has(areaId)) {
      roomMap.set(areaId, {
        id: areaId,
        name: areaNameById.get(areaId) ?? "Unassigned",
        entities: [],
      });
    }

    roomMap.get(areaId).entities.push(entity);
  }

  return Array.from(roomMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function parseWebSocketMessage(data) {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function connectToHomeAssistant({ baseUrl, token, onStatus, onDashboard, onError }) {
  const endpoint = buildWebSocketUrl(baseUrl);
  const ws = new WebSocket(endpoint);
  const queryResults = {
    states: undefined,
    areas: undefined,
    entityRegistry: undefined,
  };

  function flushDashboardData() {
    if (!Array.isArray(queryResults.states) || !Array.isArray(queryResults.areas) || !Array.isArray(queryResults.entityRegistry)) {
      return;
    }

    onDashboard?.(mapRoomsDashboard(queryResults));
    onStatus("Connected.");
  }

  ws.addEventListener("open", () => {
    onStatus("Connected. Waiting for authentication...");
  });

  ws.addEventListener("message", (event) => {
    const message = parseWebSocketMessage(event.data);
    if (!message) {
      onError("Received malformed WebSocket message.");
      return;
    }

    if (message.type === "auth_required") {
      ws.send(JSON.stringify({ type: "auth", access_token: token }));
      onStatus("Authenticating...");
      return;
    }

    if (message.type === "auth_ok") {
      ws.send(JSON.stringify({ id: GET_STATES_REQUEST_ID, type: "get_states" }));
      ws.send(JSON.stringify({ id: GET_AREAS_REQUEST_ID, type: "config/area_registry/list" }));
      ws.send(JSON.stringify({ id: GET_ENTITY_REGISTRY_REQUEST_ID, type: "config/entity_registry/list" }));
      onStatus("Authenticated. Loading rooms and entities...");
      return;
    }

    if (message.type === "auth_invalid") {
      onError(message.message || "Authentication failed.");
      ws.close();
      return;
    }

    if (message.type === "result" && message.success === false) {
      onError(message.error?.message || "Home Assistant request failed.");
      return;
    }

    if (message.type === "result" && message.id === GET_STATES_REQUEST_ID && Array.isArray(message.result)) {
      queryResults.states = message.result;
      flushDashboardData();
      return;
    }

    if (message.type === "result" && message.id === GET_AREAS_REQUEST_ID && Array.isArray(message.result)) {
      queryResults.areas = message.result;
      flushDashboardData();
      return;
    }

    if (message.type === "result" && message.id === GET_ENTITY_REGISTRY_REQUEST_ID && Array.isArray(message.result)) {
      queryResults.entityRegistry = message.result;
      flushDashboardData();
    }
  });

  ws.addEventListener("error", () => {
    onError(`WebSocket connection error while connecting to ${endpoint}.`);
  });

  ws.addEventListener("close", () => {
    onStatus("Disconnected.");
  });

  return {
    disconnect() {
      ws.close();
    },
  };
}
