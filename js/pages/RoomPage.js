import { BaseComponent } from "../components/base/BaseComponent.js";
import { PageShell } from "../components/layout/PageShell.js";
import { Tile } from "../components/cards/Tile.js";
import { openLightModal } from "../components/cards/LightModal.js";
import { openMediaModal } from "../components/cards/MediaModal.js";
import { getInArea } from "../api/ha-selectors.js";
import { selectEntities } from "../state/store.js";
import { loadHiddenRoomEntities, saveHiddenRoomEntities } from "./Overview.js";
import { t } from "../core/i18n.js";

/**
 * Room detail page (route: `/rum/:areaId`).
 *
 * Shows all entities the user has chosen to display for the area (see
 * Settings → "Rum"). Entities are grouped by domain into HA-style
 * sections (Lights, Climate, Security, Media players, Switches, ...).
 *
 * Clicking a light or media player opens the existing more-info modal.
 */
export class RoomPage extends BaseComponent {
  render() {
    const { store, params } = this.props;
    this._areaId = params?.areaId;
    this._editMode = false;
    this._showUnavailable = false;
    const area = store.getState().areas?.[this._areaId];
    this._editBtn = this._editButton();
    this._shell = new PageShell({
      title: area?.name || t("Room"),
      subtitle: t("All entities in this room"),
      actions: [this._backButton(), this._editBtn],
    });
    const root = document.createElement("div");
    this._shell.mount(root);

    this._content = document.createElement("div");
    this._content.className = "room-detail";
    this._shell.body.appendChild(this._content);

    this._renderContent(store.getState());
    return root.firstElementChild;
  }

  onMount() {
    const { store } = this.props;
    this.subscribe(store, selectEntities, () => this._renderContent(store.getState()));
  }

  _backButton() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost";
    b.textContent = "← " + t("Back");
    b.addEventListener("click", () => { window.location.hash = "/oversigt"; });
    return b;
  }

  _editButton() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn btn-ghost";
    b.textContent = t("Edit");
    b.addEventListener("click", () => {
      this._editMode = !this._editMode;
      b.textContent = this._editMode ? t("Done") : t("Edit");
      b.classList.toggle("is-active", this._editMode);
      this._renderContent(this.props.store.getState());
    });
    return b;
  }

  _renderContent(state) {
    this._content.replaceChildren();
    const areaId = this._areaId;
    const area = state.areas?.[areaId];
    if (!area) {
      this._content.textContent = t("Room not found.");
      return;
    }

    const hidden = new Set(loadHiddenRoomEntities(areaId));
    const allInArea = getInArea(state, areaId);
    // Edit mode: show every entity in the area so the user can pick.
    // Normal mode: hide user-hidden entities AND unavailable/unknown ones by default.
    let list;
    if (this._editMode) {
      list = allInArea;
    } else {
      list = allInArea.filter((e) =>
        !hidden.has(e.entityId)
        && e.state !== "unavailable"
        && e.state !== "unknown"
        && e.state != null
      );
    }

    if (this._editMode) {
      const help = document.createElement("div");
      help.className = "room-detail__hint";
      help.textContent = t("Tap entities to toggle whether they are shown. Unavailable entities are hidden by default.");
      this._content.appendChild(help);
    }

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "dash-area empty";
      empty.textContent = t("No entities selected for this room.");
      this._content.appendChild(empty);
      return;
    }

    const groups = groupByDomain(list);
    const { store, commands, eventBus } = this.props;

    for (const g of groups) {
      const section = document.createElement("section");
      section.className = "room-detail__section";

      const head = document.createElement("h3");
      head.className = "room-detail__title";
      head.innerHTML = `<span class="room-detail__icon">${g.icon}</span> ${escape(g.label)}`;
      section.appendChild(head);

      const grid = document.createElement("div");
      grid.className = "room-detail__grid";

      for (const e of g.entities) {
        const type = tileTypeFor(e.entityId);
        let onToggle;
        if (this._editMode) {
          // In edit mode: tap toggles hidden flag for this entity.
          onToggle = () => this._toggleHidden(e.entityId);
        } else if (type === "light") {
          onToggle = () => openLightModal({ entity: e, areaName: area.name, store, commands, eventBus });
        } else if (type === "media") {
          onToggle = () => openMediaModal({ entity: e, areaName: area.name, store, commands, eventBus });
        } else if (type === "switch" || type === "lock") {
          onToggle = () => callToggle(e, commands, eventBus);
        } else if (type === "scene" || type === "script") {
          onToggle = () => runEntity(e, commands, eventBus);
        } else if (type === "automation") {
          onToggle = () => callToggle(e, commands, eventBus);
        }
        const tile = new Tile({ entity: e, type, onToggle });
        tile.mount(grid);
        if (this._editMode) {
          const el = grid.lastElementChild;
          if (el) {
            const isHidden = hidden.has(e.entityId);
            el.classList.add("tile--editable");
            el.classList.toggle("tile--hidden", isHidden);
            // Badge in the corner showing visible/hidden status.
            const badge = document.createElement("span");
            badge.className = "tile-edit-badge";
            badge.textContent = isHidden ? "✕" : "✓";
            badge.title = isHidden ? t("Hidden") : t("Visible");
            el.appendChild(badge);
          }
        }
      }
      section.appendChild(grid);
      this._content.appendChild(section);
    }
  }

  _toggleHidden(entityId) {
    const areaId = this._areaId;
    const next = new Set(loadHiddenRoomEntities(areaId));
    if (next.has(entityId)) next.delete(entityId); else next.add(entityId);
    saveHiddenRoomEntities(areaId, Array.from(next));
    this.props.eventBus?.emit?.("oversigt:rooms-changed");
    this._renderContent(this.props.store.getState());
  }
}

// =====================================================================
// Grouping
// =====================================================================

const GROUP_ORDER = [
  "light", "climate", "cover", "lock", "media_player",
  "switch", "scene", "script", "automation",
  "binary_sensor", "sensor", "other",
];

const GROUP_META = {
  light:         { label: () => t("Lights"),         icon: "💡" },
  climate:       { label: () => t("Climate"),        icon: "🌡" },
  cover:         { label: () => t("Covers"),         icon: "🪟" },
  lock:          { label: () => t("Locks"),          icon: "🔒" },
  media_player:  { label: () => t("Media players"),  icon: "📺" },
  switch:        { label: () => t("Switches"),       icon: "🔌" },
  scene:         { label: () => t("Scenes"),         icon: "🎬" },
  script:        { label: () => t("Scripts"),        icon: "📜" },
  automation:    { label: () => t("Automations"),    icon: "⚙️" },
  binary_sensor: { label: () => t("Security"),       icon: "🛡" },
  sensor:        { label: () => t("Sensors"),        icon: "📈" },
  other:         { label: () => t("Other"),          icon: "✨" },
};

function groupByDomain(entities) {
  const buckets = new Map();
  for (const e of entities) {
    const dom = e.entityId.split(".")[0];
    const key = GROUP_META[dom] ? dom : "other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(e);
  }
  const result = [];
  for (const key of GROUP_ORDER) {
    const list = buckets.get(key);
    if (!list?.length) continue;
    list.sort((a, b) => (a.label || a.entityId).localeCompare(b.label || b.entityId));
    result.push({ key, label: GROUP_META[key].label(), icon: GROUP_META[key].icon, entities: list });
  }
  // Pick up any unknown buckets we didn't anticipate.
  for (const [key, list] of buckets) {
    if (GROUP_ORDER.includes(key)) continue;
    result.push({ key, label: key, icon: "✨", entities: list });
  }
  return result;
}

function tileTypeFor(entityId) {
  const dom = entityId.split(".")[0];
  if (dom === "light")        return "light";
  if (dom === "switch")       return "switch";
  if (dom === "lock")         return "lock";
  if (dom === "media_player") return "media";
  if (dom === "scene")        return "scene";
  if (dom === "script")       return "script";
  if (dom === "automation")   return "automation";
  if (dom === "binary_sensor" || dom === "sensor" || dom === "climate") return "sensor";
  return "generic";
}

async function callToggle(entity, commands, eventBus) {
  try {
    const domain = entity.entityId.split(".")[0];
    await commands.callService(domain, "toggle", {}, { entity_id: entity.entityId });
  } catch (e) {
    eventBus.emit("toast:show", { message: e.message || t("Action failed"), tone: "error" });
  }
}

async function runEntity(entity, commands, eventBus) {
  try {
    const domain = entity.entityId.split(".")[0];
    await commands.callService(domain, "turn_on", {}, { entity_id: entity.entityId });
  } catch (e) {
    eventBus.emit("toast:show", { message: e.message || t("Action failed"), tone: "error" });
  }
}

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
