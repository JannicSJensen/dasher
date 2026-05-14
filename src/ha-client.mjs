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

export function parseWebSocketMessage(data) {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

export function connectToHomeAssistant({ baseUrl, token, onStatus, onEntities, onError }) {
  const ws = new WebSocket(buildWebSocketUrl(baseUrl));

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
      ws.send(JSON.stringify({ id: 1, type: "get_states" }));
      onStatus("Authenticated. Loading entities...");
      return;
    }

    if (message.type === "auth_invalid") {
      onError(message.message || "Authentication failed.");
      ws.close();
      return;
    }

    if (message.type === "result" && message.id === 1 && Array.isArray(message.result)) {
      onEntities(mapEntityStates(message.result));
      onStatus("Connected.");
    }
  });

  ws.addEventListener("error", (event) => {
    const details = typeof event?.message === "string" && event.message ? ` ${event.message}` : "";
    onError(`WebSocket connection error.${details}`);
  });

  ws.addEventListener("close", () => {
    onStatus("Disconnected");
  });

  return {
    disconnect() {
      ws.close();
    },
  };
}
