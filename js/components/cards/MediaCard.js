import { BaseComponent } from "../base/BaseComponent.js";
import { Button } from "../ui/Button.js";
import { Slider } from "../ui/Slider.js";
import { Icon } from "../ui/Icon.js";
import { throttle } from "../../utils/throttle.js";
import { storage, STORAGE_KEYS } from "../../core/storage.js";
import { t as tr } from "../../core/i18n.js";

/**
 * L\u00f8s en HA-relativ asset-URL (typisk `entity_picture`) op mod den
 * konfigurerede HA baseUrl, s\u00e5 billedet kan loades fra localhost-dashboardet.
 * Absolutte (http/https) URLs returneres uden \u00e6ndringer.
 */
function resolveHaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (storage.get(STORAGE_KEYS.BASE_URL, "") || "").replace(/\/$/, "");
  if (!base) return url;
  return base + (url.startsWith("/") ? url : "/" + url);
}

/**
 * Media player card med flere layout-varianter.
 *
 *   new MediaCard({ entity, commands, variant }).mount(parent);
 *
 * `variant` kan v\u00e6re en af `MEDIA_CARD_VARIANTS` (default: "standard").
 *  - "standard": Header + artwork + titel + transport + volume slider
 *  - "compact":  Enkelt r\u00e6kke med lille artwork og kun play/pause
 *  - "artwork":  Stor artwork-hero med titel/artist nedenunder + transport
 *  - "minimal":  Kun titel og play/pause-knap
 */
export const MEDIA_CARD_VARIANTS = [
  { id: "standard", get label() { return tr("Standard"); } },
  { id: "compact",  get label() { return tr("Compact");  } },
  { id: "artwork",  get label() { return tr("Artwork");  } },
  { id: "minimal",  get label() { return tr("Minimal");  } },
];

export class MediaCard extends BaseComponent {
  render() {
    const variant = this.props.variant || "standard";
    switch (variant) {
      case "compact": return renderCompact(this.props);
      case "artwork": return renderArtwork(this.props);
      case "minimal": return renderMinimal(this.props);
      default:        return renderStandard(this.props);
    }
  }
}

function renderArtworkEl(entity, size = 56) {
  const attr = entity.attributes ?? {};
  if (attr.entity_picture) {
    const img = document.createElement("img");
    img.src = resolveHaUrl(attr.entity_picture);
    img.alt = "";
    img.width = size; img.height = size;
    img.style.borderRadius = "var(--radius-sm)";
    img.style.objectFit = "cover";
    return img;
  }
  const ph = document.createElement("div");
  ph.style.width = `${size}px`;
  ph.style.height = `${size}px`;
  ph.style.borderRadius = "var(--radius-sm)";
  ph.style.background = "var(--color-surface-2)";
  ph.style.display = "grid";
  ph.style.placeItems = "center";
  ph.appendChild(Icon.render("music", { size: Math.round(size * 0.4) }));
  return ph;
}

function transport(entity, commands, { iconOnlyOnly = true } = {}) {
  const playing = entity.state === "playing";
  const wrap = document.createElement("div");
  wrap.style.display = "flex";
  wrap.style.gap = "0.5rem";
  wrap.appendChild(new Button({ icon: "prev", iconOnly: true, variant: "ghost",
    ariaLabel: tr("Previous"), onClick: () => commands.mediaPrev(entity.entityId) }).render());
  wrap.appendChild(new Button({
    icon: playing ? "pause" : "play", iconOnly: true, variant: "primary",
    ariaLabel: playing ? tr("Pause") : tr("Play"),
    onClick: () => (playing ? commands.mediaPause(entity.entityId) : commands.mediaPlay(entity.entityId)),
  }).render());
  wrap.appendChild(new Button({ icon: "next", iconOnly: true, variant: "ghost",
    ariaLabel: tr("Next"), onClick: () => commands.mediaNext(entity.entityId) }).render());
  return wrap;
}

function renderStandard({ entity, commands }) {
    const attr = entity.attributes ?? {};

    const card = document.createElement("article");
    card.className = "card card--media";

    // Header: source name + state
    const head = document.createElement("header");
    head.className = "card__header";
    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = entity.label;
    head.appendChild(title);
    const stateEl = document.createElement("span");
    stateEl.style.color = "var(--color-text-2)";
    stateEl.style.fontSize = "var(--fs-sm)";
    stateEl.textContent = entity.state;
    head.appendChild(stateEl);
    card.appendChild(head);

    // Now playing
    const body = document.createElement("div");
    body.className = "card__body";

    const np = document.createElement("div");
    np.style.display = "flex";
    np.style.alignItems = "center";
    np.style.gap = "0.75rem";

    np.appendChild(renderArtworkEl(entity, 56));

    const info = document.createElement("div");
    info.style.minWidth = "0";
    info.style.flex = "1";
    const t = document.createElement("div");
    t.style.fontWeight = "600";
    t.style.whiteSpace = "nowrap";
    t.style.overflow = "hidden";
    t.style.textOverflow = "ellipsis";
    t.textContent = attr.media_title || "\u2014";
    const a = document.createElement("div");
    a.style.color = "var(--color-text-2)";
    a.style.fontSize = "var(--fs-sm)";
    a.style.whiteSpace = "nowrap";
    a.style.overflow = "hidden";
    a.style.textOverflow = "ellipsis";
    a.textContent = [attr.media_artist, attr.media_album_name].filter(Boolean).join(" \u2014 ");
    info.append(t, a);
    np.appendChild(info);
    body.appendChild(np);

    // Transport controls
    const controls = transport(entity, commands);
    controls.style.marginTop = "var(--space-3)";
    body.appendChild(controls);

    // Volume
    if (typeof attr.volume_level === "number") {
      const onVol = throttle((v) => commands.mediaVolume(entity.entityId, v / 100), 200);
      const vol = new Slider({
        label: tr("Sound"),
        unit: "%",
        value: Math.round(attr.volume_level * 100),
        onInput: onVol,
      });
      body.appendChild(vol.render());
    }

    card.appendChild(body);
    return card;
}

function renderCompact({ entity, commands }) {
  const attr = entity.attributes ?? {};
  const card = document.createElement("article");
  card.className = "card card--media card--media-compact";
  const row = document.createElement("div");
  row.className = "card__body";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "0.75rem";

  row.appendChild(renderArtworkEl(entity, 40));

  const info = document.createElement("div");
  info.style.minWidth = "0";
  info.style.flex = "1";
  const t = document.createElement("div");
  t.style.fontWeight = "600";
  t.style.whiteSpace = "nowrap";
  t.style.overflow = "hidden";
  t.style.textOverflow = "ellipsis";
  t.textContent = entity.label;
  const sub = document.createElement("div");
  sub.style.color = "var(--color-text-2)";
  sub.style.fontSize = "var(--fs-xs)";
  sub.style.whiteSpace = "nowrap";
  sub.style.overflow = "hidden";
  sub.style.textOverflow = "ellipsis";
  sub.textContent = attr.media_title
    ? `${attr.media_title}${attr.media_artist ? " \u2014 " + attr.media_artist : ""}`
    : entity.state;
  info.append(t, sub);
  row.appendChild(info);

  const playing = entity.state === "playing";
  row.appendChild(new Button({
    icon: playing ? "pause" : "play", iconOnly: true, variant: "primary",
    ariaLabel: playing ? tr("Pause") : tr("Play"),
    onClick: () => (playing ? commands.mediaPause(entity.entityId) : commands.mediaPlay(entity.entityId)),
  }).render());

  card.appendChild(row);
  return card;
}

function renderArtwork({ entity, commands }) {
  const attr = entity.attributes ?? {};
  const card = document.createElement("article");
  card.className = "card card--media card--media-artwork";
  const body = document.createElement("div");
  body.className = "card__body";
  body.style.display = "grid";
  body.style.gap = "var(--space-3)";

  // Hero artwork
  const hero = document.createElement("div");
  hero.style.width = "100%";
  hero.style.aspectRatio = "1 / 1";
  hero.style.maxHeight = "260px";
  hero.style.borderRadius = "var(--radius-md)";
  hero.style.background = "var(--color-surface-2)";
  hero.style.backgroundSize = "cover";
  hero.style.backgroundPosition = "center";
  if (attr.entity_picture) {
    hero.style.backgroundImage = `url("${resolveHaUrl(attr.entity_picture)}")`;
  } else {
    hero.style.display = "grid";
    hero.style.placeItems = "center";
    hero.appendChild(Icon.render("music", { size: 64 }));
  }
  body.appendChild(hero);

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = attr.media_title || entity.label;
  const sub = document.createElement("div");
  sub.style.color = "var(--color-text-2)";
  sub.style.fontSize = "var(--fs-sm)";
  sub.textContent = [attr.media_artist, attr.media_album_name].filter(Boolean).join(" \u2014 ") || entity.label;
  body.append(title, sub);

  const controls = transport(entity, commands);
  body.appendChild(controls);

  if (typeof attr.volume_level === "number") {
    const onVol = throttle((v) => commands.mediaVolume(entity.entityId, v / 100), 200);
    body.appendChild(new Slider({
      label: tr("Sound"), unit: "%",
      value: Math.round(attr.volume_level * 100),
      onInput: onVol,
    }).render());
  }

  card.appendChild(body);
  return card;
}

function renderMinimal({ entity, commands }) {
  const card = document.createElement("article");
  card.className = "card card--media card--media-minimal";
  const row = document.createElement("div");
  row.className = "card__body";
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "0.5rem";
  row.style.justifyContent = "space-between";

  const t = document.createElement("div");
  t.style.fontWeight = "600";
  t.style.whiteSpace = "nowrap";
  t.style.overflow = "hidden";
  t.style.textOverflow = "ellipsis";
  t.style.minWidth = "0";
  t.style.flex = "1";
  t.textContent = entity.label;
  row.appendChild(t);

  const playing = entity.state === "playing";
  row.appendChild(new Button({
    icon: playing ? "pause" : "play", iconOnly: true, variant: "primary",
    ariaLabel: playing ? tr("Pause") : tr("Play"),
    onClick: () => (playing ? commands.mediaPause(entity.entityId) : commands.mediaPlay(entity.entityId)),
  }).render());

  card.appendChild(row);
  return card;
}
