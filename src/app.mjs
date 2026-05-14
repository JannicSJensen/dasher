import { connectToHomeAssistant } from "./ha-client.mjs";
import { loadSettings } from "./settings-store.mjs";

const connectButton = document.getElementById("connect-button");
const disconnectButton = document.getElementById("disconnect-button");
const configuredUrlElement = document.getElementById("configured-url");
const configuredTokenElement = document.getElementById("configured-token");
const statusElement = document.getElementById("status");
const roomNavElement = document.getElementById("room-nav");
const roomsElement = document.getElementById("rooms");

let session;

function maskToken(token) {
  if (!token) {
    return "Not configured";
  }

  if (token.length <= 8) {
    return "Configured";
  }

  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function renderConfiguredSettings() {
  const settings = loadSettings();
  configuredUrlElement.textContent = `URL: ${settings.baseUrl || "Not configured"}`;
  configuredTokenElement.textContent = `Token: ${maskToken(settings.token)}`;
  return settings;
}

function roomAnchorId(roomId) {
  return `room-${roomId.replace(/[^a-z0-9_-]/gi, "-")}`;
}

function renderRoomDashboard(rooms) {
  roomNavElement.innerHTML = "";
  roomsElement.innerHTML = "";

  if (!rooms.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No rooms found in Home Assistant.";
    roomsElement.append(empty);
    return;
  }

  for (const room of rooms) {
    const navLink = document.createElement("a");
    navLink.href = `#${roomAnchorId(room.id)}`;
    navLink.className = "room-link";
    navLink.textContent = `${room.name} (${room.entities.length})`;
    roomNavElement.append(navLink);

    const section = document.createElement("section");
    section.className = "room-card";
    section.id = roomAnchorId(room.id);

    const heading = document.createElement("h2");
    heading.textContent = room.name;

    const list = document.createElement("ul");
    list.className = "entity-list";

    for (const entity of room.entities) {
      const item = document.createElement("li");
      item.className = "entity-item";

      const label = document.createElement("span");
      label.textContent = entity.label;

      const value = document.createElement("strong");
      value.textContent = entity.state;

      item.append(label, value);
      list.append(item);
    }

    if (!room.entities.length) {
      const emptyRow = document.createElement("p");
      emptyRow.className = "empty-room";
      emptyRow.textContent = "No entities assigned to this room.";
      section.append(heading, emptyRow);
    } else {
      section.append(heading, list);
    }

    roomsElement.append(section);
  }
}

function setStatus(message) {
  statusElement.textContent = message;
}

connectButton.addEventListener("click", () => {
  const settings = renderConfiguredSettings();

  if (!settings.baseUrl || !settings.token) {
    setStatus("Error: Add Home Assistant URL and token in Settings first.");
    return;
  }

  if (session) {
    session.disconnect();
    session = undefined;
  }

  setStatus("Connecting...");
  roomNavElement.innerHTML = "";
  roomsElement.innerHTML = "";

  try {
    session = connectToHomeAssistant({
      baseUrl: settings.baseUrl,
      token: settings.token,
      onStatus: setStatus,
      onDashboard: renderRoomDashboard,
      onError: (message) => setStatus(`Error: ${message}`),
    });
  } catch (error) {
    setStatus(`Error: ${error.message}`);
  }
});

disconnectButton.addEventListener("click", () => {
  if (session) {
    session.disconnect();
    session = undefined;
  }

  roomNavElement.innerHTML = "";
  roomsElement.innerHTML = "";
  setStatus("Disconnected.");
});

renderConfiguredSettings();
