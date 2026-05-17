import { t } from "../../core/i18n.js";
import { storage, STORAGE_KEYS } from "../../core/storage.js";

/**
 * Resolve an HA-relative asset URL (typically `entity_picture`) against the
 * configured HA baseUrl so that browser `<img>` tags can fetch it.
 */
function resolveHaUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  const base = (storage.get(STORAGE_KEYS.BASE_URL, "") || "").replace(/\/$/, "");
  if (!base) return url;
  return base + (url.startsWith("/") ? url : "/" + url);
}

/**
 * Media player popup, inspired by the Home Assistant "more-info" sheet.
 *
 *   openMediaModal({ entity, areaName, store, commands, eventBus });
 *
 * - Header: area eyebrow + entity name, close + decorative action icons.
 * - Album art (entity_picture) with fallback music-note placeholder.
 * - Title (media_title or friendly name) + subtitle (artist / app / source).
 * - Transport row: shuffle, prev, play/pause, next, repeat.
 * - Horizontal volume slider with mute icon.
 * - Footer: media browse, source select, power.
 *
 * Subscribes to entity changes so state stays live while the modal is open.
 * Returns a `close()` function.
 */
export function openMediaModal({ entity, areaName, store, commands, eventBus }) {
  let current = entity;
  const entityId = entity.entityId;

  // Home Assistant media_player supported_features bitmask:
  //   PAUSE=1, SEEK=2, VOLUME_SET=4, VOLUME_MUTE=8, PREVIOUS=16, NEXT=32,
  //   TURN_ON=128, TURN_OFF=256, PLAY_MEDIA=512, VOLUME_STEP=1024,
  //   SELECT_SOURCE=2048, STOP=4096, CLEAR_PLAYLIST=8192, PLAY=16384,
  //   SHUFFLE_SET=32768, SELECT_SOUND_MODE=65536, BROWSE_MEDIA=131072,
  //   REPEAT_SET=262144, GROUPING=524288.
  const FEAT = {
    PAUSE: 1, VOLUME_SET: 4, VOLUME_MUTE: 8, PREV: 16, NEXT: 32,
    TURN_ON: 128, TURN_OFF: 256, PLAY_MEDIA: 512, SELECT_SOURCE: 2048,
    PLAY: 16384, SHUFFLE_SET: 32768, BROWSE_MEDIA: 131072, REPEAT_SET: 262144,
  };
  function caps(e) {
    const f = e.attributes?.supported_features || 0;
    return {
      play:    (f & FEAT.PLAY) !== 0,
      pause:   (f & FEAT.PAUSE) !== 0,
      prev:    (f & FEAT.PREV) !== 0,
      next:    (f & FEAT.NEXT) !== 0,
      volSet:  (f & FEAT.VOLUME_SET) !== 0,
      volMute: (f & FEAT.VOLUME_MUTE) !== 0,
      shuffle: (f & FEAT.SHUFFLE_SET) !== 0,
      repeat:  (f & FEAT.REPEAT_SET) !== 0,
      source:  (f & FEAT.SELECT_SOURCE) !== 0,
      browse:  (f & FEAT.BROWSE_MEDIA) !== 0,
      turnOn:  (f & FEAT.TURN_ON) !== 0,
      turnOff: (f & FEAT.TURN_OFF) !== 0,
    };
  }
  const cap = caps(entity);

  const backdrop = document.createElement("div");
  backdrop.className = "mm-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "mm-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  backdrop.appendChild(dialog);

  // --- header ---------------------------------------------------------
  const header = document.createElement("header");
  header.className = "mm-header";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "mm-close";
  closeBtn.setAttribute("aria-label", t("Close"));
  closeBtn.innerHTML = ICON_X;
  const titleWrap = document.createElement("div");
  titleWrap.className = "mm-titlewrap";
  const eyebrow = document.createElement("div");
  eyebrow.className = "mm-eyebrow";
  eyebrow.textContent = areaName || "";
  const titleEl = document.createElement("div");
  titleEl.className = "mm-title";
  titleEl.textContent = entity.label || entity.entityId;
  titleWrap.append(eyebrow, titleEl);
  header.append(closeBtn, titleWrap);

  // --- body -----------------------------------------------------------
  const body = document.createElement("div");
  body.className = "mm-body";

  // Album art
  const artWrap = document.createElement("div");
  artWrap.className = "mm-art";
  const artImg = document.createElement("img");
  artImg.className = "mm-art__img";
  artImg.alt = "";
  artImg.hidden = true;
  artImg.referrerPolicy = "no-referrer";
  artImg.addEventListener("error", () => {
    artImg.hidden = true;
    artPlaceholder.hidden = false;
  });
  const artPlaceholder = document.createElement("div");
  artPlaceholder.className = "mm-art__placeholder";
  artPlaceholder.innerHTML = ICON_NOTE;
  artWrap.append(artImg, artPlaceholder);

  // Now-playing info
  const info = document.createElement("div");
  info.className = "mm-info";
  const titleNow = document.createElement("div");
  titleNow.className = "mm-now-title";
  const subtitleNow = document.createElement("div");
  subtitleNow.className = "mm-now-sub";
  info.append(titleNow, subtitleNow);

  // Transport — only include buttons the player supports.
  const transport = document.createElement("div");
  transport.className = "mm-transport";
  const shuffleBtn = cap.shuffle ? transportButton(ICON_SHUFFLE, t("Shuffle")) : null;
  const prevBtn    = cap.prev    ? transportButton(ICON_PREV, t("Previous")) : null;
  const playBtn    = (cap.play || cap.pause) ? transportButton(ICON_PLAY, t("Play / Pause"), "mm-play") : null;
  const nextBtn    = cap.next    ? transportButton(ICON_NEXT, t("Next")) : null;
  const repeatBtn  = cap.repeat  ? transportButton(ICON_REPEAT, t("Repeat")) : null;
  for (const b of [shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn]) if (b) transport.appendChild(b);

  // Volume — only if supported.
  const volRow = document.createElement("div");
  volRow.className = "mm-volume";
  let muteBtn = null, volTrack = null, volFill = null, volKnob = null;
  if (cap.volMute) {
    muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "mm-mute";
    muteBtn.setAttribute("aria-label", t("Mute"));
    muteBtn.innerHTML = ICON_VOL;
    volRow.appendChild(muteBtn);
  }
  if (cap.volSet) {
    volTrack = document.createElement("div");
    volTrack.className = "mm-vol__track";
    volFill = document.createElement("div");
    volFill.className = "mm-vol__fill";
    volKnob = document.createElement("div");
    volKnob.className = "mm-vol__knob";
    volTrack.append(volFill, volKnob);
    volRow.appendChild(volTrack);
  }

  // Footer round buttons — gated by features.
  const footer = document.createElement("div");
  footer.className = "mm-footer";
  const browseBtn = cap.browse ? footButton(ICON_BROWSE, t("Browse media")) : null;
  const sourceBtn = cap.source ? footButton(ICON_SOURCE, t("Source")) : null;
  const powerBtn  = (cap.turnOn || cap.turnOff) ? footButton(ICON_POWER, t("Power")) : null;
  for (const b of [browseBtn, sourceBtn, powerBtn]) if (b) footer.appendChild(b);

  body.append(artWrap, info);
  if (transport.childElementCount) body.appendChild(transport);
  if (volRow.childElementCount) body.appendChild(volRow);
  if (footer.childElementCount) body.appendChild(footer);
  dialog.append(header, body);
  document.body.appendChild(backdrop);

  // ---- live state ----------------------------------------------------
  function repaint() {
    const e = current;
    const a = e.attributes || {};
    const state = e.state;
    const isPlaying = state === "playing";
    const isOff = state === "off" || state === "standby" || state === "unavailable";

    // Album art
    const pic = a.entity_picture_local || a.entity_picture;
    if (pic) {
      const resolved = resolveHaUrl(pic);
      if (artImg.src !== resolved) artImg.src = resolved;
      artImg.hidden = false;
      artPlaceholder.hidden = true;
    } else {
      artImg.removeAttribute("src");
      artImg.hidden = true;
      artPlaceholder.hidden = false;
    }

    // Title / subtitle
    titleNow.textContent = a.media_title || a.media_channel || a.media_series_title || e.label || "";
    const subParts = [];
    if (a.media_artist) subParts.push(a.media_artist);
    if (a.media_album_name && a.media_album_name !== a.media_artist) subParts.push(a.media_album_name);
    if (!subParts.length && a.app_name) subParts.push(a.app_name);
    if (!subParts.length && a.source) subParts.push(a.source);
    if (!subParts.length && isOff) subParts.push(state === "unavailable" ? t("Unavailable") : t("Off"));
    subtitleNow.textContent = subParts.join(" — ");

    // Play/Pause icon — disable when neither play nor pause is currently possible.
    if (playBtn) {
      playBtn.innerHTML = isPlaying ? ICON_PAUSE : ICON_PLAY;
      playBtn.classList.toggle("is-playing", isPlaying);
      playBtn.disabled = isPlaying ? !cap.pause : !cap.play;
    }

    // Shuffle / Repeat active state
    if (shuffleBtn) shuffleBtn.classList.toggle("is-active", !!a.shuffle);
    if (repeatBtn)  repeatBtn.classList.toggle("is-active", a.repeat && a.repeat !== "off");

    // Volume slider
    const muted = !!a.is_volume_muted;
    const vol = typeof a.volume_level === "number" ? a.volume_level : 0;
    const pct = Math.round(vol * 100);
    if (volFill) volFill.style.width = `${muted ? 0 : pct}%`;
    if (volKnob) volKnob.style.left = `${muted ? 0 : pct}%`;
    if (muteBtn) {
      muteBtn.classList.toggle("is-muted", muted);
      muteBtn.innerHTML = muted ? ICON_VOL_MUTE : ICON_VOL;
    }

    // Power state — gate icon by which side is available.
    if (powerBtn) {
      powerBtn.classList.toggle("is-off", isOff);
      powerBtn.disabled = isOff ? !cap.turnOn : !cap.turnOff;
    }

    // Source button is only meaningful when there's a source_list.
    if (sourceBtn) sourceBtn.disabled = !(a.source_list && a.source_list.length);

    // Globally disable everything if entity is unavailable.
    const disabled = state === "unavailable";
    for (const b of [shuffleBtn, prevBtn, playBtn, nextBtn, repeatBtn, muteBtn, browseBtn, sourceBtn, powerBtn]) {
      if (b && disabled) b.disabled = true;
    }
  }
  repaint();

  const unsubscribe = store.subscribe(
    (s) => s.entities[entityId],
    (e) => { if (e) { current = e; repaint(); } },
  );

  // ---- interactions --------------------------------------------------
  function reportErr(err) {
    eventBus?.emit?.("toast:show", { message: err?.message || t("Action failed"), tone: "error" });
  }

  playBtn?.addEventListener("click", () => {
    const isPlaying = current.state === "playing";
    const p = isPlaying ? commands.mediaPause(entityId) : commands.mediaPlay(entityId);
    p.catch(reportErr);
  });
  prevBtn?.addEventListener("click", () => commands.mediaPrev(entityId).catch(reportErr));
  nextBtn?.addEventListener("click", () => commands.mediaNext(entityId).catch(reportErr));
  shuffleBtn?.addEventListener("click", () => {
    const shuffle = !current.attributes?.shuffle;
    commands.callService("media_player", "shuffle_set", { shuffle }, { entity_id: entityId }).catch(reportErr);
  });
  repeatBtn?.addEventListener("click", () => {
    const order = ["off", "all", "one"];
    const cur = current.attributes?.repeat || "off";
    const next = order[(order.indexOf(cur) + 1) % order.length];
    commands.callService("media_player", "repeat_set", { repeat: next }, { entity_id: entityId }).catch(reportErr);
  });
  muteBtn?.addEventListener("click", () => {
    const is_volume_muted = !current.attributes?.is_volume_muted;
    commands.callService("media_player", "volume_mute", { is_volume_muted }, { entity_id: entityId }).catch(reportErr);
  });
  powerBtn?.addEventListener("click", () => {
    const isOff = current.state === "off" || current.state === "standby";
    const svc = isOff ? "turn_on" : "turn_off";
    commands.callService("media_player", svc, {}, { entity_id: entityId }).catch(reportErr);
  });
  browseBtn?.addEventListener("click", () => {
    eventBus?.emit?.("toast:show", { message: t("Media browser not available yet"), tone: "info" });
  });
  sourceBtn?.addEventListener("click", () => openSourcePicker());

  function openSourcePicker() {
    const sources = current.attributes?.source_list || [];
    if (!sources.length) {
      eventBus?.emit?.("toast:show", { message: t("No sources available"), tone: "info" });
      return;
    }
    const menu = document.createElement("div");
    menu.className = "mm-menu";
    for (const src of sources) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mm-menu__item";
      item.textContent = src;
      if (src === current.attributes?.source) item.classList.add("is-active");
      item.addEventListener("click", () => {
        commands.callService("media_player", "select_source", { source: src }, { entity_id: entityId }).catch(reportErr);
        menu.remove();
      });
      menu.appendChild(item);
    }
    menu.addEventListener("click", (ev) => ev.stopPropagation());
    backdrop.appendChild(menu);
    const onceClose = (ev) => {
      if (!menu.contains(ev.target)) { menu.remove(); backdrop.removeEventListener("click", onceClose); }
    };
    setTimeout(() => backdrop.addEventListener("click", onceClose), 0);
  }

  // Volume drag — only attach when slider exists.
  if (volTrack) {
    let dragging = false;
    const pctFromEvent = (ev) => {
      const rect = volTrack.getBoundingClientRect();
      const x = (ev.touches?.[0]?.clientX ?? ev.clientX) - rect.left;
      return Math.max(0, Math.min(rect.width, x)) / rect.width;
    };
    const setVolume = (p) => {
      const v = Math.max(0, Math.min(1, p));
      const pct = Math.round(v * 100);
      volFill.style.width = `${pct}%`;
      volKnob.style.left = `${pct}%`;
      commands.mediaVolume(entityId, v).catch(reportErr);
    };
    volTrack.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      dragging = true;
      volTrack.setPointerCapture?.(ev.pointerId);
      setVolume(pctFromEvent(ev));
    });
    volTrack.addEventListener("pointermove", (ev) => { if (dragging) setVolume(pctFromEvent(ev)); });
    const stop = () => { dragging = false; };
    volTrack.addEventListener("pointerup", stop);
    volTrack.addEventListener("pointercancel", stop);
  }

  // ---- close ---------------------------------------------------------
  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    unsubscribe?.();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
  document.addEventListener("keydown", onKey);

  return close;
}

function transportButton(svgStr, label, extraClass = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mm-tbtn " + extraClass;
  b.setAttribute("aria-label", label);
  b.innerHTML = svgStr;
  return b;
}

function footButton(svgStr, label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mm-fbtn";
  b.setAttribute("aria-label", label);
  b.innerHTML = svgStr;
  return b;
}

// =====================================================================
// Inline SVG icons (currentColor)
// =====================================================================
const ICON_X = svg(`<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`);
const ICON_HISTORY = svg(`<rect x="4" y="10" width="3" height="10" stroke="currentColor" stroke-width="2" fill="none"/><rect x="10.5" y="6" width="3" height="14" stroke="currentColor" stroke-width="2" fill="none"/><rect x="17" y="13" width="3" height="7" stroke="currentColor" stroke-width="2" fill="none"/>`);
const ICON_SETTINGS = svg(`<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.5a7 7 0 0 0-2.1 1.2l-2.4-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2.1 1.2L10 21h4l.4-2.5a7 7 0 0 0 2.1-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" stroke="currentColor" stroke-width="2" fill="none"/>`);
const ICON_MORE = svg(`<circle cx="12" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/>`);
const ICON_NOTE = svg(`<path d="M9 18V6l10-2v12" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><circle cx="7" cy="18" r="2.2" fill="currentColor"/><circle cx="17" cy="16" r="2.2" fill="currentColor"/>`, 56);
const ICON_PLAY = svg(`<path d="M8 5v14l11-7z" fill="currentColor"/>`);
const ICON_PAUSE = svg(`<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>`);
const ICON_PREV = svg(`<path d="M7 5v14M19 5L9 12l10 7V5z" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round"/>`);
const ICON_NEXT = svg(`<path d="M17 5v14M5 5l10 7L5 19V5z" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round"/>`);
const ICON_SHUFFLE = svg(`<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M17 4l4 3-4 3M17 14l4 3-4 3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
const ICON_REPEAT = svg(`<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
const ICON_VOL = svg(`<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round"/>`);
const ICON_VOL_MUTE = svg(`<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="currentColor" stroke-width="2" fill="currentColor" stroke-linejoin="round"/><path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`);
const ICON_BROWSE = svg(`<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/>`);
const ICON_SOURCE = svg(`<path d="M15 3h6v6M21 3l-9 9M9 21H3v-6M3 21l9-9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
const ICON_POWER = svg(`<path d="M12 3v9M7 6.5a8 8 0 1 0 10 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`);

function svg(inner, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;
}
