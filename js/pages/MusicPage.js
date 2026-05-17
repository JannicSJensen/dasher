import { BaseComponent } from "../components/base/BaseComponent.js";
import { PageShell } from "../components/layout/PageShell.js";
import { MediaCard, MEDIA_CARD_VARIANTS } from "../components/cards/MediaCard.js";
import { Loader } from "../components/ui/Loader.js";
import { getMediaPlayers } from "../api/ha-selectors.js";
import { selectEntities, selectReady } from "../state/store.js";
import { storage, STORAGE_KEYS } from "../core/storage.js";
import { t } from "../core/i18n.js";

export class MusicPage extends BaseComponent {
  render() {
    const { store } = this.props;
    this._shell = new PageShell({
      title: t("Music"),
      subtitle: t("Control players in your home"),
    });
    const root = document.createElement("div");
    this._shell.mount(root);

    this._filterBar = document.createElement("div");
    Object.assign(this._filterBar.style, {
      display: "flex", gap: "var(--space-2)", flexWrap: "wrap",
      marginBottom: "var(--space-3)",
    });
    this._shell.body.appendChild(this._filterBar);

    this._content = document.createElement("div");
    this._shell.body.appendChild(this._content);

    this._renderFilterBar();
    this._renderContent(store.getState());
    return root.firstElementChild;
  }

  onMount() {
    const { store, eventBus } = this.props;
    this.subscribe(store, selectEntities, () => this._renderContent(store.getState()));
    this.subscribe(store, selectReady, () => this._renderContent(store.getState()));
    // Indstillinger kan toggle synlige music-devices \u2014 re-render n\u00e5r det sker.
    this.on(eventBus, "musik:devices-changed", () => this._renderContent(store.getState()));
    this.on(eventBus, "musik:layout-changed",  () => this._renderContent(store.getState()));
  }

  _renderFilterBar() {
    this._filterBar.replaceChildren();
    const active = new Set(loadMusicStateFilter());
    for (const opt of MUSIC_STATE_FILTER_OPTIONS) {
      const on = active.has(opt.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn btn--${on ? "primary" : "ghost"}`;
      btn.textContent = opt.label;
      btn.addEventListener("click", () => {
        const next = new Set(loadMusicStateFilter());
        if (next.has(opt.id)) next.delete(opt.id);
        else next.add(opt.id);
        saveMusicStateFilter([...next]);
        this._renderFilterBar();
        this._renderContent(this.props.store.getState());
      });
      this._filterBar.appendChild(btn);
    }
  }

  _renderContent(state) {
    this._content.replaceChildren();

    if (!state.ready && Object.keys(state.entities).length === 0) {
      this._content.appendChild(new Loader({ kind: "skeleton", lines: 3 }).render());
      return;
    }
    const allPlayers = getMediaPlayers(state);
    const hiddenDevs = new Set(loadHiddenMusicDevices());
    const stateFilter = new Set(loadMusicStateFilter());
    const variant = loadMusicLayout();
    const groups = listMusicDeviceGroupsByArea(state)
      .map((g) => ({
        ...g,
        devices: g.devices.filter((d) => !hiddenDevs.has(d.id)),
      }))
      .filter((g) => g.devices.length > 0);
    if (groups.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = allPlayers.length
        ? t("No visible players — select under Settings.")
        : "No media_player entities found.";
      this._content.appendChild(empty);
      return;
    }
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "var(--space-5)";
    for (const g of groups) {
      const section = document.createElement("section");
      section.style.display = "grid";
      section.style.gap = "var(--space-2)";

      const h = document.createElement("h3");
      h.style.margin = "0";
      h.style.fontSize = "var(--fs-md)";
      h.style.color = "var(--color-text-1)";
      h.textContent = g.area?.name || t("Other");
      section.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "grid grid--two";
      for (const d of g.devices) {
        for (const entId of d.entityIds) {
          const ent = state.entities[entId];
          if (!ent) continue;
          if (ent.state === "unavailable") continue;
          if (!stateFilter.has(ent.state)) continue;
          grid.appendChild(new MediaCard({ entity: ent, commands: this.props.commands, variant }).render());
        }
      }
      if (grid.children.length === 0) continue;
      section.appendChild(grid);
      wrap.appendChild(section);
    }
    if (wrap.children.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = t("No players match the selected filter.");
      this._content.appendChild(empty);
      return;
    }
    this._content.appendChild(wrap);
  }
}

/** Knapperne i filter-baren \u2014 id matcher entity.state-v\u00e6rdier. */
export const MUSIC_STATE_FILTER_OPTIONS = [
  { id: "playing", get label() { return t("Playing"); } },
  { id: "idle",    get label() { return t("Idle");    } },
  { id: "off",     get label() { return t("Off");     } },
];
const MUSIC_STATE_FILTER_DEFAULT = ["playing"];

export function loadMusicStateFilter() {
  const v = storage.get(STORAGE_KEYS.MUSIK_STATE_FILTER, null);
  if (!Array.isArray(v)) return [...MUSIC_STATE_FILTER_DEFAULT];
  return v.filter((x) => MUSIC_STATE_FILTER_OPTIONS.some((o) => o.id === x));
}
export function saveMusicStateFilter(ids) {
  storage.set(STORAGE_KEYS.MUSIK_STATE_FILTER, Array.from(new Set(ids)));
}

/** Layout-variant til MediaCard p\u00e5 Musik-siden. */
const MUSIC_LAYOUT_DEFAULT = "standard";
export function loadMusicLayout() {
  const v = storage.get(STORAGE_KEYS.MUSIK_LAYOUT, MUSIC_LAYOUT_DEFAULT);
  return MEDIA_CARD_VARIANTS.some((o) => o.id === v) ? v : MUSIC_LAYOUT_DEFAULT;
}
export function saveMusicLayout(id) {
  if (!MEDIA_CARD_VARIANTS.some((o) => o.id === id)) return;
  storage.set(STORAGE_KEYS.MUSIK_LAYOUT, id);
}

/**
 * Kandidat-devices til Musik-siden. Hver entry samler alle media_player
 * entiteter under det samme HA-device. Entiteter uden device samles
 * under en pseudo-device "Andre".
 */
export function listMusicDeviceCandidates(state) {
  const players  = getMediaPlayers(state);
  const devReg   = state.devices      || {};
  const entToDev = state.entityDevice || {};
  const groups = new Map();
  for (const p of players) {
    const devId = entToDev[p.entityId] || "__none__";
    if (!groups.has(devId)) {
      const dev = devReg[devId];
      groups.set(devId, {
        id: devId,
        name: dev?.name || (devId === "__none__" ? t("Other") : devId),
        entityIds: [],
      });
    }
    groups.get(devId).entityIds.push(p.entityId);
  }
  return [...groups.values()]
    .map((g) => ({
      id:   g.id,
      name: g.name,
      hint: `${g.entityIds.length} ${g.entityIds.length === 1 ? t("player") : t("players")}`,
      entityIds: g.entityIds,
    }))
    .sort((a, b) => (a.id === "__none__") - (b.id === "__none__") || a.name.localeCompare(b.name));
}

/**
 * Grupperer media_player-devices efter HA-rum (area). Devices uden
 * area (eller hvis ingen af deres entiteter har et area) samles under
 * en pseudo-area med id "__none__" og navnet "Andre".
 *
 * Returnerer: `[{ area: {id, name}|null, devices: [{id, name, hint, entityIds}] }]`
 * \u2014 sorteret alfabetisk efter area-navn, "Andre" til sidst.
 */
export function listMusicDeviceGroupsByArea(state) {
  const devs       = listMusicDeviceCandidates(state);
  const devReg     = state.devices    || {};
  const entityArea = state.entityArea || {};
  const areaReg    = state.areas      || {};

  const byArea = new Map();
  for (const d of devs) {
    const dev = devReg[d.id];
    let areaId = dev?.area_id ?? null;
    // Fald tilbage til area fra f\u00f8rste entitet (h\u00e5ndterer "__none__" device
    // og devices uden eget area_id).
    if (!areaId) {
      for (const eid of d.entityIds) {
        if (entityArea[eid]) { areaId = entityArea[eid]; break; }
      }
    }
    const key = areaId || "__none__";
    if (!byArea.has(key)) {
      byArea.set(key, {
        area: areaId ? areaReg[areaId] || { id: areaId, name: areaId } : null,
        devices: [],
      });
    }
    byArea.get(key).devices.push(d);
  }
  for (const g of byArea.values()) g.devices.sort((a, b) => a.name.localeCompare(b.name));
  return [...byArea.values()].sort((a, b) => {
    const aNone = !a.area, bNone = !b.area;
    if (aNone !== bNone) return aNone - bNone;
    return (a.area?.name || "").localeCompare(b.area?.name || "");
  });
}

export function loadHiddenMusicDevices() {
  const v = storage.get(STORAGE_KEYS.MUSIK_HIDDEN_DEVICES, []);
  return Array.isArray(v) ? v : [];
}
export function saveHiddenMusicDevices(ids) {
  storage.set(STORAGE_KEYS.MUSIK_HIDDEN_DEVICES, Array.from(new Set(ids)));
}
