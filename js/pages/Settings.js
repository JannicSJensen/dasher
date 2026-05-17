import { BaseComponent } from "../components/base/BaseComponent.js";
import { PageShell } from "../components/layout/PageShell.js";
import { Card } from "../components/ui/Card.js";
import { Button } from "../components/ui/Button.js";
import { Toggle } from "../components/ui/Toggle.js";
import { Badge } from "../components/ui/Badge.js";
import { storage, STORAGE_KEYS } from "../core/storage.js";
import { logger } from "../core/logger.js";
import { APP_VERSION } from "../config.js";
import { selectConnection, selectSettings, selectDebug } from "../state/store.js";
import {
  listRoomsWithEntities,
  listWasteCandidates,
  listAlarmCandidates,
  listFavoriteCandidates,
  listCalendarCandidates,
  listRoomDeviceCandidates,
  loadHidden,
  saveHidden,
  loadHiddenRoomEntities,
  saveHiddenRoomEntities,
} from "./Overview.js";
import {
  listMusicDeviceCandidates,
  listMusicDeviceGroupsByArea,
  loadHiddenMusicDevices,
  saveHiddenMusicDevices,
  loadMusicLayout,
  saveMusicLayout,
} from "./MusicPage.js";
import { MEDIA_CARD_VARIANTS } from "../components/cards/MediaCard.js";
import { t, LANGUAGES, getLanguage, setLanguage } from "../core/i18n.js";
import {
  getDefaultSidebarItems,
  loadSidebarLabels,
  saveSidebarLabels,
} from "../components/layout/SideBar.js";

/**
 * Indstillinger: URL + token form, tema, debug logging, reconnect /
 * test connection, og version.
 */
export class Settings extends BaseComponent {
  render() {
    const root = document.createElement("div");
    this._shell = new PageShell({
      title: t("Settings"),
      subtitle: t("Connection and appearance"),
    });
    this._shell.mount(root);

    this._shell.body.appendChild(this._connectionCard());
    this._shell.body.appendChild(this._appearanceCard());
    this._shell.body.appendChild(this._languageCard());
    this._shell.body.appendChild(this._sidebarLabelsCard());
    this._shell.body.appendChild(this._oversigtSectionsCard());
    this._shell.body.appendChild(this._musikCard());
    this._shell.body.appendChild(this._musikLayoutCard());
    this._shell.body.appendChild(this._debugCard());
    this._shell.body.appendChild(this._aboutCard());

    return root.firstElementChild;
  }

  // -------- sections ---------------------------------------------------

  _connectionCard() {
    const { store, ws, eventBus } = this.props;
    const settings = store.getState().settings;

    const form = document.createElement("form");
    form.style.display = "grid";
    form.style.gap = "var(--space-3)";

    const urlInput = labeledInput(t("Home Assistant URL"), {
      type: "url", value: settings.baseUrl, placeholder: "https://home.example.com",
      autocomplete: "url", required: true,
    });
    const tokenInput = labeledInput(t("Long-lived access token"), {
      type: "password", value: settings.token, placeholder: "eyJhbGciOi...",
      autocomplete: "off",
    });

    form.append(urlInput.wrap, tokenInput.wrap);

    // Status row
    const statusRow = document.createElement("div");
    statusRow.style.display = "flex";
    statusRow.style.alignItems = "center";
    statusRow.style.gap = "var(--space-2)";
    const statusLabel = document.createElement("span");
    statusLabel.style.color = "var(--color-text-2)";
    statusLabel.textContent = t("Status:");
    this._statusBadge = new Badge({ text: "—" }).render();
    this._statusMsg = document.createElement("span");
    this._statusMsg.style.color = "var(--color-text-2)";
    this._statusMsg.style.fontSize = "var(--fs-sm)";
    statusRow.append(statusLabel, this._statusBadge, this._statusMsg);
    form.appendChild(statusRow);

    // Actions row
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "var(--space-2)";
    actions.style.flexWrap = "wrap";

    const saveBtn = new Button({
      label: t("Save & connect"), variant: "primary", type: "submit",
    }).render();
    const reconnectBtn = new Button({
      label: t("Reconnect now"), variant: "ghost", icon: "refresh",
      onClick: () => ws.reconnectNow(),
    }).render();
    const disconnectBtn = new Button({
      label: t("Disconnect"), variant: "danger",
      onClick: () => ws.disconnect(),
    }).render();
    const logoutBtn = new Button({
      label: t("Log out"), variant: "ghost",
      onClick: () => eventBus.emit("auth:logout"),
    }).render();
    actions.append(saveBtn, reconnectBtn, disconnectBtn, logoutBtn);
    form.appendChild(actions);

    this.listen(form, "submit", (e) => {
      e.preventDefault();
      const url = urlInput.input.value.trim();
      const token = tokenInput.input.value.trim();
      if (!url) {
        eventBus.emit("toast:show", { message: t("Enter Home Assistant URL"), tone: "error" });
        return;
      }
      storage.set(STORAGE_KEYS.BASE_URL, url);
      storage.set(STORAGE_KEYS.TOKEN, token);
      store.setSettings({ baseUrl: url, token });
      ws.setCredentials({ url, token });
      ws.reconnectNow();
      eventBus.emit("toast:show", { message: t("Settings saved"), tone: "success" });
    });

    // Live status binding
    this.subscribe(store, selectConnection, ({ status, message }) => {
      this._statusBadge.dataset.tone = toneFor(status);
      this._statusBadge.textContent = t(STATUS_KEY[status] || status);
      this._statusMsg.textContent = message || "";
    });
    this.subscribe(store, selectSettings, ({ baseUrl, token }) => {
      if (document.activeElement !== urlInput.input) urlInput.input.value = baseUrl;
      if (document.activeElement !== tokenInput.input) tokenInput.input.value = token;
    });

    // Initial paint
    const c = store.getState().connection;
    this._statusBadge.dataset.tone = toneFor(c.status);
    this._statusBadge.textContent = t(STATUS_KEY[c.status] || c.status);
    this._statusMsg.textContent = c.message || "";

    return new Card({ title: t("Connection"), subtitle: "Home Assistant", body: form }).render();
  }

  _appearanceCard() {
    const { store, eventBus } = this.props;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "var(--space-2)";
    row.style.flexWrap = "wrap";

    for (const themeId of ["dark", "light", "warm", "party"]) {
      const btn = new Button({
        label: t(THEME_LABELS[themeId] ?? capitalize(themeId)),
        variant: store.getState().theme === themeId ? "primary" : "ghost",
        onClick: () => eventBus.emit("theme:set", themeId),
      }).render();
      btn.dataset.theme = themeId;
      row.appendChild(btn);
    }
    this.subscribe(store, (s) => s.theme, (theme) => {
      row.querySelectorAll("button[data-theme]").forEach((b) => {
        b.className = `btn btn--${b.dataset.theme === theme ? "primary" : "ghost"}`;
      });
    });

    return new Card({ title: t("Theme"), body: row }).render();
  }

  _languageCard() {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "var(--space-2)";
    row.style.flexWrap = "wrap";
    const current = getLanguage();
    for (const lang of LANGUAGES) {
      const btn = new Button({
        label: lang.label,
        variant: current === lang.id ? "primary" : "ghost",
        onClick: () => setLanguage(lang.id),
      }).render();
      row.appendChild(btn);
    }
    return new Card({
      title: t("Language"),
      subtitle: t("Choose interface language"),
      body: row,
    }).render();
  }

  _sidebarLabelsCard() {
    const { eventBus } = this.props;
    const items = getDefaultSidebarItems();
    const overrides = { ...loadSidebarLabels() };

    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gap = "var(--space-2)";

    for (const item of items) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.alignItems = "center";
      row.style.gap = "var(--space-2)";

      const defaultLabel = item.labelKey ? t(item.labelKey) : item.label;

      const field = labeledInput(item.path, {
        type: "text",
        value: overrides[item.path] || "",
        placeholder: defaultLabel,
      });
      const helper = document.createElement("span");
      helper.style.fontSize = "var(--fs-xs)";
      helper.style.color = "var(--color-text-2)";
      helper.textContent = t("Default: {name}", { name: defaultLabel });
      field.wrap.appendChild(helper);

      const persist = () => {
        const next = { ...loadSidebarLabels() };
        const v = field.input.value.trim();
        if (v) next[item.path] = v;
        else delete next[item.path];
        saveSidebarLabels(next);
        eventBus.emit("sidebar:labels-changed");
      };
      this.listen(field.input, "input", persist);
      this.listen(field.input, "change", persist);

      const reset = new Button({
        label: t("Reset to default"),
        variant: "ghost",
        onClick: () => {
          field.input.value = "";
          persist();
        },
      }).render();
      reset.style.alignSelf = "end";

      row.append(field.wrap, reset);
      body.appendChild(row);
    }

    return new Card({
      title: t("Sidebar labels"),
      subtitle: t("Rename the items in the sidebar and bottom navigation"),
      body,
    }).render();
  }

  /**
   * S\u00e9t af 5 sektioner som hver lader brugeren v\u00e6lge hvad der vises p\u00e5
   * Oversigt-siden. Hver sektion mapper til en STORAGE_KEY og en
   * "listX"-funktion fra OversigtPage.
   */
  _oversigtSectionsCard() {
    const { store, eventBus } = this.props;
    const sections = [
      { id: "rooms",     title: t("Rooms"),      list: listRoomsWithEntities,   helper: t("Room sections on Overview.") },
      { id: "waste",     title: t("Waste"),      list: listWasteCandidates,     helper: t("Which waste sensors are shown in the Waste card.") },
      { id: "alarm",     title: t("Alarm"),      list: listAlarmCandidates,     helper: t("Which alarm panel is shown (the first selected).") },
      { id: "favorites", title: t("Favorites"),  list: listFavoriteCandidates,  helper: t("Shortcuts / scenes / input_boolean in the Favorites card.") },
      { id: "calendar",  title: t("Calendar"),   list: listCalendarCandidates,  helper: t("Which calendars are shown in the Calendar card.") },
    ];

    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gap = "var(--space-4)";

    for (const sec of sections) {
      body.appendChild(this._buildSectionBlock(sec, store, eventBus));
    }

    return new Card({
      title: t("Overview content"),
      subtitle: t("Choose which cards and entities are shown on the Overview page"),
      body,
    }).render();
  }

  _buildSectionBlock({ id, title, list, helper }, store, eventBus) {
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "var(--space-2)";

    const h = document.createElement("h4");
    h.style.margin = "0";
    h.style.fontSize = "var(--fs-sm)";
    h.style.textTransform = "uppercase";
    h.style.letterSpacing = "0.06em";
    h.style.color = "var(--color-text-2)";
    h.textContent = title;
    wrap.appendChild(h);

    if (helper) {
      const p = document.createElement("p");
      p.style.margin = "0";
      p.style.color = "var(--color-text-2)";
      p.style.fontSize = "var(--fs-xs)";
      p.textContent = helper;
      wrap.appendChild(p);
    }

    const listEl = document.createElement("div");
    listEl.style.display = "grid";
    listEl.style.gap = "6px";
    wrap.appendChild(listEl);

    const repaint = () => {
      const state = store.getState();
      const items = list(state);
      const hidden = new Set(loadHidden(id));
      listEl.replaceChildren();
      if (items.length === 0) {
        const empty = document.createElement("p");
        empty.style.color = "var(--color-text-2)";
        empty.style.fontSize = "var(--fs-xs)";
        empty.style.margin = "0";
        empty.textContent = t("No candidates found yet.");
        listEl.appendChild(empty);
        return;
      }
      for (const it of items) {
        if (id === "rooms") {
          listEl.appendChild(renderRoomRow(it, hidden, store, eventBus, (rowId, show) => {
            const next = new Set(loadHidden(id));
            if (show) next.delete(rowId); else next.add(rowId);
            saveHidden(id, [...next]);
            eventBus.emit("oversigt:rooms-changed");
          }));
        } else {
          listEl.appendChild(renderSectionRow(it, hidden, (rowId, show) => {
            const next = new Set(loadHidden(id));
            if (show) next.delete(rowId); else next.add(rowId);
            saveHidden(id, [...next]);
            eventBus.emit("oversigt:rooms-changed");
          }));
        }
      }
    };
    repaint();
    this.subscribe(store, (s) => s.areas, repaint);
    this.subscribe(store, (s) => s.entities, repaint);

    return wrap;
  }

  /**
   * Musik-sektion: list af devices der ejer media_player-entiteter.
   * Checkbox toggler om devicet (og alle dets media_player-entiteter)
   * vises p\u00e5 Musik-siden.
   */
  _musikCard() {
    const { store, eventBus } = this.props;

    const body = document.createElement("div");
    body.style.display = "grid";
    body.style.gap = "var(--space-2)";

    const helper = document.createElement("p");
    helper.style.margin = "0";
    helper.style.color = "var(--color-text-2)";
    helper.style.fontSize = "var(--fs-xs)";
      helper.textContent = t("Choose which player devices are shown on the Music page.");
    body.appendChild(helper);

    const listEl = document.createElement("div");
    listEl.style.display = "grid";
    listEl.style.gap = "6px";
    body.appendChild(listEl);

    const repaint = () => {
      const groups = listMusicDeviceGroupsByArea(store.getState());
      const hidden = new Set(loadHiddenMusicDevices());
      listEl.replaceChildren();
      if (groups.length === 0) {
        const empty = document.createElement("p");
        empty.style.color = "var(--color-text-2)";
        empty.style.fontSize = "var(--fs-xs)";
        empty.style.margin = "0";
        empty.textContent = t("No players found yet.");
        listEl.appendChild(empty);
        return;
      }
      for (const g of groups) {
        const section = document.createElement("div");
        section.style.display = "grid";
        section.style.gap = "6px";

        const h = document.createElement("h4");
        h.style.margin = "var(--space-2) 0 0 0";
        h.style.fontSize = "var(--fs-sm)";
        h.style.textTransform = "uppercase";
        h.style.letterSpacing = "0.06em";
        h.style.color = "var(--color-text-2)";
        h.textContent = g.area?.name || t("Other");
        section.appendChild(h);

        for (const dev of g.devices) {
          section.appendChild(renderSectionRow(dev, hidden, (rowId, show) => {
            const next = new Set(loadHiddenMusicDevices());
            if (show) next.delete(rowId); else next.add(rowId);
            saveHiddenMusicDevices([...next]);
            eventBus.emit("musik:devices-changed");
          }));
        }
        listEl.appendChild(section);
      }
    };
    repaint();
    this.subscribe(store, (s) => s.entities, repaint);
    this.subscribe(store, (s) => s.devices,  repaint);

    return new Card({
      title: t("Music"),
      subtitle: t("Select player devices"),
      body,
    }).render();
  }

  /**
   * Vis-type for media_player-kort p\u00e5 Musik-siden. Inspireret af
   * HOMEii Flow's "Full / Compact / Mobile / Artwork"-layouts.
   */
  _musikLayoutCard() {
    const { eventBus } = this.props;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "var(--space-2)";
    row.style.flexWrap = "wrap";

    const renderButtons = () => {
      row.replaceChildren();
      const current = loadMusicLayout();
      for (const opt of MEDIA_CARD_VARIANTS) {
        const btn = new Button({
          label: opt.label,
          variant: current === opt.id ? "primary" : "ghost",
          onClick: () => {
            saveMusicLayout(opt.id);
            eventBus.emit("musik:layout-changed");
            renderButtons();
          },
        }).render();
        btn.dataset.layout = opt.id;
        row.appendChild(btn);
      }
    };
    renderButtons();

    return new Card({
      title: t("Music card layout"),
      subtitle: t("Choose how media_player is shown on the Music page"),
      body: row,
    }).render();
  }

  _debugCard() {
    const { store } = this.props;
    const body = document.createElement("div");
    const toggle = new Toggle({
      checked: store.getState().debug,
      label: t("Debug logging in the console"),
      onChange: (next) => {
        store.setDebug(next);
        storage.set(STORAGE_KEYS.LOG_LEVEL, next ? "debug" : "warn");
        logger.setLevel(next ? "debug" : "warn");
      },
    }).render();
    body.appendChild(toggle);
    return new Card({ title: t("Debug"), body }).render();
  }

  _aboutCard() {
    const body = document.createElement("div");
    body.style.color = "var(--color-text-2)";
    body.innerHTML = `Dasher v${APP_VERSION} — vanilla JS, no bundler.`;
    return new Card({ title: t("About"), body }).render();
  }
}

// -------- helpers ------------------------------------------------------

function labeledInput(label, attrs) {
  const wrap = document.createElement("label");
  wrap.style.display = "grid";
  wrap.style.gap = "var(--space-1)";
  const span = document.createElement("span");
  span.textContent = label;
  span.style.color = "var(--color-text-2)";
  span.style.fontSize = "var(--fs-sm)";
  const input = document.createElement("input");
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "value") input.value = v ?? "";
    else if (v === true) input.setAttribute(k, "");
    else if (v != null && v !== false) input.setAttribute(k, String(v));
  }
  input.style.padding = "0.6rem 0.75rem";
  input.style.background = "var(--color-surface-2)";
  input.style.border = "1px solid var(--color-border)";
  input.style.borderRadius = "var(--radius-sm)";
  input.style.color = "var(--color-text-0)";
  input.style.font = "inherit";
  wrap.append(span, input);
  return { wrap, input };
}

function toneFor(status) {
  return ({
    connected: "good",
    connecting: "info",
    reconnecting: "warn",
    error: "bad",
    offline: "bad",
    idle: "info",
  })[status];
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

const THEME_LABELS = {
  dark: "Dark",
  light: "Light",
  warm: "Warm",
  party: "Party",
};

const STATUS_KEY = {
  idle: "Idle",
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  error: "Error",
  offline: "Offline",
};

function renderRoomToggle(room, hiddenSet, onChange) {
  return renderSectionRow(
    { id: room.id, name: room.name, hint: `${room.entityCount} ${room.entityCount === 1 ? t("entity") : t("entities")}` },
    hiddenSet,
    onChange,
  );
}

function renderSectionRow(item, hiddenSet, onChange) {
  const row = document.createElement("label");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "var(--space-3)";
  row.style.padding = "8px 12px";
  row.style.background = "var(--color-bg)";
  row.style.border = "1px solid var(--color-border)";
  row.style.borderRadius = "var(--radius-md)";
  row.style.cursor = "pointer";

  const info = document.createElement("div");
  info.style.display = "flex";
  info.style.flexDirection = "column";
  info.style.minWidth = "0";

  const name = document.createElement("span");
  name.textContent = item.name;
  name.style.fontWeight = "500";
  const meta = document.createElement("span");
  meta.textContent = item.hint || "";
  meta.style.fontSize = "var(--fs-xs)";
  meta.style.color = "var(--color-text-2)";
  meta.style.overflow = "hidden";
  meta.style.textOverflow = "ellipsis";
  meta.style.whiteSpace = "nowrap";
  info.append(name, meta);
  row.appendChild(info);

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !hiddenSet.has(item.id);
  cb.style.width = "20px";
  cb.style.height = "20px";
  cb.style.accentColor = "var(--color-accent)";
  cb.addEventListener("change", () => onChange(item.id, cb.checked));
  row.appendChild(cb);

  return row;
}

/**
 * Som renderSectionRow, men info-omr\u00e5det er en knap der \u00e5bner en
 * popup hvor brugeren kan v\u00e6lge hvilke entiteter der vises i rummet
 * p\u00e5 Oversigt-siden. H\u00f8jre side holder stadig synlighed for hele rummet.
 */
function renderRoomRow(item, hiddenSet, store, eventBus, onChange) {
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.justifyContent = "space-between";
  row.style.gap = "var(--space-3)";
  row.style.padding = "8px 12px";
  row.style.background = "var(--color-bg)";
  row.style.border = "1px solid var(--color-border)";
  row.style.borderRadius = "var(--radius-md)";
  row.style.cursor = "pointer";
  row.setAttribute("role", "button");
  row.tabIndex = 0;

  const info = document.createElement("div");
  info.style.flex = "1";
  info.style.minWidth = "0";
  info.style.display = "flex";
  info.style.flexDirection = "column";
  info.style.alignItems = "flex-start";
  info.style.pointerEvents = "none";

  const name = document.createElement("span");
  name.textContent = item.name;
  name.style.fontWeight = "500";
  const meta = document.createElement("span");
  meta.style.fontSize = "var(--fs-xs)";
  meta.style.color = "var(--color-text-2)";
  meta.style.overflow = "hidden";
  meta.style.textOverflow = "ellipsis";
  meta.style.whiteSpace = "nowrap";

  const renderMeta = () => {
    const devices = listRoomDeviceCandidates(store.getState(), item.id);
    const totalDev = devices.length;
    const hiddenEnts = new Set(loadHiddenRoomEntities(item.id));
    const shownDev = devices.filter((d) => d.entityIds.some((e) => !hiddenEnts.has(e))).length;
    meta.textContent = t("{n} of {total} {label} • click to choose", {
      n: shownDev, total: totalDev,
      label: totalDev === 1 ? t("device") : t("devices"),
    });
  };
  renderMeta();
  info.append(name, meta);

  const openModal = () => {
    openRoomEntitiesModal({
      title: item.name,
      areaId: item.id,
      store,
      eventBus,
      onAfterChange: renderMeta,
    });
  };
  row.addEventListener("click", openModal);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); }
  });
  row.appendChild(info);

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !hiddenSet.has(item.id);
  cb.title = t("Show the room on Overview");
  cb.style.width = "20px";
  cb.style.height = "20px";
  cb.style.accentColor = "var(--color-accent)";
  cb.style.cursor = "pointer";
  // Klik p\u00e5 selve checkboxen m\u00e5 ikke samtidig \u00e5bne popuppen.
  cb.addEventListener("click", (e) => e.stopPropagation());
  cb.addEventListener("change", (e) => {
    e.stopPropagation();
    onChange(item.id, cb.checked);
  });
  row.appendChild(cb);

  return row;
}

/**
 * Popup med checkboxes for entiteter i et rum. \u00c6ndringer gemmes med det
 * samme og emit'er "oversigt:rooms-changed" s\u00e5 Oversigten re-renderer.
 */
function openRoomEntitiesModal({ title, areaId, store, eventBus, onAfterChange }) {
  const backdrop = document.createElement("div");
  Object.assign(backdrop.style, {
    position: "fixed", inset: "0", background: "rgba(0,0,0,0.55)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: "1000", padding: "var(--space-4)",
  });

  const dialog = document.createElement("div");
  Object.assign(dialog.style, {
    background: "var(--color-bg-2)", color: "var(--color-text-0)",
    border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
    width: "min(520px, 100%)", maxHeight: "85vh",
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
  });

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "var(--space-3) var(--space-4)",
    borderBottom: "1px solid var(--color-border)",
  });
  const h = document.createElement("h3");
  h.style.margin = "0";
  h.style.fontSize = "var(--fs-md)";
  h.textContent = t("Devices in {name}", { name: title });
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "\u2715";
  Object.assign(closeBtn.style, {
    background: "transparent", border: "0", color: "var(--color-text-1)",
    fontSize: "1.25rem", cursor: "pointer", padding: "0 4px",
  });
  header.append(h, closeBtn);

  const body = document.createElement("div");
  Object.assign(body.style, {
    padding: "var(--space-3) var(--space-4)", overflow: "auto",
    display: "grid", gap: "6px",
  });

  const footer = document.createElement("div");
  Object.assign(footer.style, {
    display: "flex", justifyContent: "space-between", gap: "var(--space-2)",
    padding: "var(--space-3) var(--space-4)",
    borderTop: "1px solid var(--color-border)",
  });
  const helperText = document.createElement("span");
  helperText.style.color = "var(--color-text-2)";
  helperText.style.fontSize = "var(--fs-xs)";
  helperText.style.alignSelf = "center";
  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "var(--space-2)";
  const selectAll = document.createElement("button");
  selectAll.type = "button";
  selectAll.className = "btn btn--ghost";
  selectAll.textContent = t("Select all");
  const clearAll = document.createElement("button");
  clearAll.type = "button";
  clearAll.className = "btn btn--ghost";
  clearAll.textContent = t("Deselect all");
  actions.append(clearAll, selectAll);
  footer.append(helperText, actions);

  dialog.append(header, body, footer);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const candidates = () => listRoomDeviceCandidates(store.getState(), areaId);

  const repaint = () => {
    const items = candidates();
    const hiddenEnts = new Set(loadHiddenRoomEntities(areaId));
    body.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.style.color = "var(--color-text-2)";
      empty.style.margin = "0";
      empty.textContent = t("No devices found in this room.");
      body.appendChild(empty);
    } else {
      for (const dev of items) {
        // Et device er "vist" hvis mindst én af dets entiteter ikke er skjult.
        const shown = dev.entityIds.some((id) => !hiddenEnts.has(id));
        const hiddenForRow = shown ? new Set() : new Set([dev.id]);
        body.appendChild(renderSectionRow(
          { id: dev.id, name: dev.name, hint: dev.hint },
          hiddenForRow,
          (_rowId, show) => {
            const next = new Set(loadHiddenRoomEntities(areaId));
            if (show) { for (const e of dev.entityIds) next.delete(e); }
            else      { for (const e of dev.entityIds) next.add(e); }
            saveHiddenRoomEntities(areaId, [...next]);
            eventBus.emit("oversigt:rooms-changed");
            onAfterChange?.();
            helperText.textContent = helper();
          },
        ));
      }
    }
    helperText.textContent = helper();
  };

  const helper = () => {
    const items = candidates();
    const hiddenEnts = new Set(loadHiddenRoomEntities(areaId));
    const shown = items.filter((d) => d.entityIds.some((e) => !hiddenEnts.has(e))).length;
    return t("{n} of {total} selected", { n: shown, total: items.length });
  };

  selectAll.addEventListener("click", () => {
    saveHiddenRoomEntities(areaId, []);
    eventBus.emit("oversigt:rooms-changed");
    onAfterChange?.();
    repaint();
  });
  clearAll.addEventListener("click", () => {
    const all = candidates().flatMap((d) => d.entityIds);
    saveHiddenRoomEntities(areaId, all);
    eventBus.emit("oversigt:rooms-changed");
    onAfterChange?.();
    repaint();
  });

  const close = () => {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", onKey);

  repaint();
}
