import { BaseComponent } from "../base/BaseComponent.js";
import { fmtNumber } from "../../utils/format.js";
import { t as tr } from "../../core/i18n.js";

/**
 * HomeKit-inspireret Tile.
 *
 *   new Tile({
 *     entity,                  // HA-entity (se ENTITY SHAPE nedenfor)
 *     type: "light",           // "light" | "sensor" | "media" | "lock" | "generic"
 *     onToggle: (entity) => {} // valgfri callback ved klik/toggle
 *   }).mount(parent);
 *
 * ENTITY SHAPE
 * ------------
 * Komponenten accepterer to varianter af entity-objektet for at være
 * kompatibel både med rå HA-states og vores normaliserede store-form:
 *   { entity_id, name?, state, attributes?, unit? }   (spec)
 *   { entityId,  label, state, attributes }           (store)
 *
 * Begge mappes til samme interne form i normalize().
 *
 * DESIGN-PRINCIPPER
 * -----------------
 * - "Glanceable": ikon, status-dot, navn, state og toggle har hver sin
 *   tydelige plads så øjet kan parse tilen på <1s.
 * - State-driven: `isOn = state === "on"` styrer .is-on / .is-off klasser
 *   og en `--tile-accent` custom property som CSS bruger til glow/gradient.
 * - Adgængelighed: når tilen er klikbar er rod-elementet et <button> for
 *   gratis Enter/Space + focus-ring; ellers <div role="group"> så vi ikke
 *   lover en interaktion vi ikke leverer.
 */
export class Tile extends BaseComponent {
  render() {
    const entity = normalize(this.props.entity);
    const { type = "generic", onToggle } = this.props;

    const isOn = entity?.state === "on"
      || entity?.state === "playing"
      || entity?.state === "unlocked";
    const togglable = typeof onToggle === "function";

    // Klikbart vs. read-only: brug semantisk korrekt element.
    const tile = document.createElement(togglable ? "button" : "div");
    if (togglable) tile.type = "button";
    else tile.setAttribute("role", "group");

    tile.className = `tile glass tile--${type} ${isOn ? "is-on" : "is-off"}`;
    tile.dataset.entityId = entity?.entity_id ?? "";
    tile.style.setProperty("--tile-accent", accentFor(type, entity));

    // --- top: ikon + status-dot ---------------------------------------
    const top = document.createElement("div");
    top.className = "tile-top";

    const icon = document.createElement("div");
    icon.className = "tile-icon";
    icon.textContent = this.renderIcon(type, entity);
    top.appendChild(icon);

    const dot = document.createElement("span");
    dot.className = "tile-status-dot";
    dot.dataset.state = statusFor(entity, isOn); // "on" | "off" | "error"
    top.appendChild(dot);
    tile.appendChild(top);

    // --- body: title + state-tekst ------------------------------------
    const body = document.createElement("div");
    body.className = "tile-body";

    const title = document.createElement("div");
    title.className = "tile-title";
    title.textContent = entity?.name ?? entity?.entity_id ?? tr("Unknown");
    body.appendChild(title);

    const state = document.createElement("div");
    state.className = "tile-state";
    state.textContent = this.formatState(type, entity);
    body.appendChild(state);
    tile.appendChild(body);

    // --- control (toggle) --------------------------------------------
    const control = this.renderControls(type, isOn);
    if (control) tile.appendChild(control);

    // Hele tilen + toggle deler samme handler så klik et hvilket som
    // helst sted på tilen virker.
    if (togglable) {
      this.listen(tile, "click", (e) => {
        // Hvis tilen indeholder et internt link, lad det vinde.
        if (e.target.closest("a")) return;
        onToggle(this.props.entity);
      });
    }

    return tile;
  }

  // ---- ikon (emoji per spec) ----------------------------------------

  renderIcon(type, entity) {
    return ICONS[type] ?? iconFromAttributes(entity) ?? ICONS.generic;
  }

  // ---- control corner -----------------------------------------------

  renderControls(type, isOn) {
    // Kun togglebare typer får en toggle. Sensorer og media er read-only.
    if (type !== "light" && type !== "switch" && type !== "lock") return null;
    const wrap = document.createElement("div");
    wrap.className = "tile-control";
    const t = document.createElement("div");
    t.className = "toggle";
    t.dataset.on = isOn ? "true" : "false";
    t.setAttribute("aria-hidden", "true"); // den ydre <button> bærer rollen
    wrap.appendChild(t);
    return wrap;
  }

  // ---- state-tekst ---------------------------------------------------

  formatState(type, entity) {
    if (!entity) return "—";

    if (type === "light" || type === "switch") {
      if (entity.state === "on")  return tr("On");
      if (entity.state === "off") return tr("Off");
      return capitalize(entity.state);
    }

    if (type === "lock") {
      if (entity.state === "locked")   return tr("Locked");
      if (entity.state === "unlocked") return tr("Unlocked");
      return capitalize(entity.state);
    }

    if (type === "sensor") {
      const unit = entity.unit ?? entity.attributes?.unit_of_measurement ?? "";
      const n = Number(entity.state);
      if (Number.isFinite(n)) return fmtNumber(n, { unit, digits: unit === "%" ? 0 : 1 });
      return entity.state ?? "—";
    }

    if (type === "media") {
      const map = { playing: tr("Playing"), paused: tr("Pause"), idle: tr("Idle"), off: tr("Off") };
      const base = map[entity.state] ?? capitalize(entity.state);
      const title = entity.attributes?.media_title;
      return title ? `${base} · ${title}` : base;
    }

    return capitalize(entity.state ?? "—");
  }
}

// =====================================================================
// Helpers
// =====================================================================

const ICONS = {
  light:   "💡",
  sensor:  "🌡",
  media:   "🎵",
  lock:    "🔒",
  switch:  "🔌",
  generic: "⚙️",
};

function iconFromAttributes(entity) {
  const cls = entity?.attributes?.device_class;
  if (!cls) return null;
  if (cls === "temperature" || cls === "humidity") return "🌡";
  if (cls === "illuminance") return "☀️";
  if (cls === "motion")      return "🏃";
  if (cls === "door")        return "🚪";
  if (cls === "window")      return "🪟";
  return null;
}

/**
 * Normalisér både {entity_id, name, ...} (spec) og {entityId, label, ...}
 * (vores store) til samme interne form. Tile'en arbejder kun videre med
 * det normaliserede objekt.
 */
function normalize(e) {
  if (!e) return null;
  return {
    entity_id:  e.entity_id ?? e.entityId,
    name:       e.name      ?? e.label,
    state:      e.state,
    attributes: e.attributes ?? {},
    unit:       e.unit ?? e.attributes?.unit_of_measurement,
  };
}

function statusFor(entity, isOn) {
  if (!entity) return "off";
  if (entity.state === "unavailable") return "error";
  return isOn ? "on" : "off";
}

/**
 * Accent-farve (CSS custom property). Lys bruger gerne deres egen
 * rgb_color hvis sat, så tilen reflekterer det aktuelle pærefarve.
 */
function accentFor(type, entity) {
  if (type === "light") {
    const rgb = entity?.attributes?.rgb_color;
    if (Array.isArray(rgb) && rgb.length === 3) return `rgb(${rgb.join(",")})`;
    return "var(--color-warning)"; // varm gul som fallback
  }
  if (type === "lock")   return "var(--color-success)";
  if (type === "media")  return "var(--color-accent)";
  if (type === "switch") return "var(--color-accent-2)";
  return "var(--color-accent)";
}

function capitalize(s) {
  if (s == null) return "";
  const str = String(s);
  return str.charAt(0).toUpperCase() + str.slice(1);
}
