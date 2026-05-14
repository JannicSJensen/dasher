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

const ROOM_ICONS = [
  { match: /(living|lounge|stue)/i, icon: "🛋️" },
  { match: /(kitchen|køkken|cook)/i, icon: "🍳" },
  { match: /(bed|sove)/i, icon: "🛏️" },
  { match: /(bath|bad|shower|toilet|wc)/i, icon: "🛁" },
  { match: /(office|kontor|study|work)/i, icon: "💻" },
  { match: /(garage|carport)/i, icon: "🚗" },
  { match: /(garden|yard|have|outside|outdoor|patio|terrace|balcony|balkon)/i, icon: "🌿" },
  { match: /(kid|child|nursery|baby|playroom|børne)/i, icon: "🧸" },
  { match: /(dining|spise)/i, icon: "🍽️" },
  { match: /(laundry|utility|vask)/i, icon: "🧺" },
  { match: /(hall|entry|entr|entré|hallway|gang)/i, icon: "🚪" },
  { match: /(attic|loft)/i, icon: "🪜" },
  { match: /(basement|cellar|kælder)/i, icon: "🧱" },
  { match: /(gym|fitness)/i, icon: "🏋️" },
  { match: /(media|cinema|theater|tv)/i, icon: "🎬" },
];

const STATE_TONES = {
  on: "good",
  off: "info",
  open: "warn",
  opening: "warn",
  closed: "info",
  closing: "info",
  home: "good",
  not_home: "info",
  away: "warn",
  unavailable: "bad",
  unknown: "bad",
  locked: "good",
  unlocked: "warn",
  armed_home: "good",
  armed_away: "good",
  disarmed: "warn",
  triggered: "bad",
  idle: "info",
  playing: "good",
  paused: "warn",
};

function pickRoomIcon(name) {
  for (const { match, icon } of ROOM_ICONS) {
    if (match.test(name)) {
      return icon;
    }
  }
  return "🏠";
}

function stateTone(state) {
  return STATE_TONES[String(state).toLowerCase()] ?? "neutral";
}

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
  configuredUrlElement.textContent = settings.baseUrl || "Not configured";
  configuredTokenElement.textContent = maskToken(settings.token);
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

    const navIcon = document.createElement("span");
    navIcon.setAttribute("aria-hidden", "true");
    navIcon.textContent = pickRoomIcon(room.name);
    const navName = document.createElement("span");
    navName.textContent = room.name;
    const navCount = document.createElement("span");
    navCount.className = "pill";
    navCount.textContent = room.entities.length;
    navLink.append(navIcon, navName, navCount);
    roomNavElement.append(navLink);

    const card = document.createElement("section");
    card.className = "room-card";
    card.id = roomAnchorId(room.id);

    const header = document.createElement("div");
    header.className = "room-header";

    const icon = document.createElement("div");
    icon.className = "room-icon";
    icon.textContent = pickRoomIcon(room.name);

    const titleWrap = document.createElement("div");
    titleWrap.className = "room-title";
    const heading = document.createElement("h2");
    heading.textContent = room.name;
    const small = document.createElement("small");
    small.textContent = `${room.entities.length} ${room.entities.length === 1 ? "entity" : "entities"}`;
    titleWrap.append(heading, small);

    header.append(icon, titleWrap);
    card.append(header);

    if (!room.entities.length) {
      const emptyRow = document.createElement("p");
      emptyRow.className = "empty-room";
      emptyRow.textContent = "No entities assigned to this room.";
      card.append(emptyRow);
    } else {
      const list = document.createElement("ul");
      list.className = "entity-list";

      for (const entity of room.entities) {
        const item = document.createElement("li");
        item.className = "entity-item";

        const label = document.createElement("span");
        label.className = "entity-label";
        label.textContent = entity.label;
        label.title = entity.entityId;

        const value = document.createElement("span");
        value.className = "entity-state";
        value.dataset.tone = stateTone(entity.state);
        value.textContent = entity.state;

        item.append(label, value);
        list.append(item);
      }

      card.append(list);
    }

    roomsElement.append(card);
  }
}

function setStatus(message, state = "idle") {
  statusElement.textContent = message;
  statusElement.dataset.state = state;
}

function statusFromMessage(message) {
  const lower = message.toLowerCase();
  if (lower.startsWith("error")) return "error";
  if (lower.includes("disconnect")) return "idle";
  if (lower === "connected.") return "connected";
  return "connecting";
}

connectButton.addEventListener("click", () => {
  const settings = renderConfiguredSettings();

  if (!settings.baseUrl || !settings.token) {
    setStatus("Add Home Assistant URL and token in Settings first.", "error");
    return;
  }

  if (session) {
    session.disconnect();
    session = undefined;
  }

  setStatus("Connecting...", "connecting");
  roomNavElement.innerHTML = "";
  roomsElement.innerHTML = "";

  try {
    session = connectToHomeAssistant({
      baseUrl: settings.baseUrl,
      token: settings.token,
      onStatus: (message) => setStatus(message, statusFromMessage(message)),
      onDashboard: renderRoomDashboard,
      onError: (message) => setStatus(`Error: ${message}`, "error"),
    });
  } catch (error) {
    setStatus(`Error: ${error.message}`, "error");
  }
});

disconnectButton.addEventListener("click", () => {
  if (session) {
    session.disconnect();
    session = undefined;
  }

  roomNavElement.innerHTML = "";
  roomsElement.innerHTML = "";
  setStatus("Disconnected.", "idle");
});

renderConfiguredSettings();
