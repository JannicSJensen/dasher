import { t } from "../../core/i18n.js";

/**
 * Light control popup, inspired by the Home Assistant "more-info" sheet.
 *
 *   openLightModal({ entity, areaName, store, commands, eventBus });
 *
 * - Header: area eyebrow + entity name, close + decorative action icons.
 * - Big brightness % readout + last-changed text.
 * - Vertical brightness slider (drag/click to set brightness_pct).
 * - Mode pill row: power toggle, brightness, color, color-temp.
 * - Preset color swatches (rgb_color) + warm/cool whites (color_temp_kelvin).
 * - Effect button (decorative placeholder).
 * - Footer with the entity id and connection state.
 *
 * Subscribes to entity changes so brightness/state stay live while the
 * modal is open. Returns a `close()` function.
 */
export function openLightModal({ entity, areaName, store, commands, eventBus }) {
  let current = entity;
  const entityId = entity.entityId;

  // ---- Capability detection -----------------------------------------
  // Home Assistant exposes light capabilities via attributes:
  //   supported_color_modes: ["onoff" | "brightness" | "color_temp" | "hs" | "xy" | "rgb" | "rgbw" | "rgbww" | "white"]
  //   supported_features:    bitmask — EFFECT = 4
  //   effect_list:           array of effect names (when EFFECT is supported)
  const COLOR_MODES_WITH_COLOR = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);
  const COLOR_MODES_WITH_BRIGHTNESS = new Set([
    "brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white",
  ]);
  function caps(e) {
    const a = e.attributes || {};
    const modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
    const features = typeof a.supported_features === "number" ? a.supported_features : 0;
    const effects = Array.isArray(a.effect_list) ? a.effect_list : [];
    return {
      hasBrightness: modes.some((m) => COLOR_MODES_WITH_BRIGHTNESS.has(m)),
      hasColor:      modes.some((m) => COLOR_MODES_WITH_COLOR.has(m)),
      hasColorTemp:  modes.includes("color_temp"),
      hasEffects:    (features & 4) !== 0 && effects.length > 0,
      effects,
    };
  }
  const cap = caps(entity);

  const backdrop = document.createElement("div");
  backdrop.className = "lm-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "lm-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  backdrop.appendChild(dialog);

  // --- header ---------------------------------------------------------
  const header = document.createElement("header");
  header.className = "lm-header";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "lm-close";
  closeBtn.setAttribute("aria-label", t("Close"));
  closeBtn.innerHTML = ICON_X;
  const titleWrap = document.createElement("div");
  titleWrap.className = "lm-titlewrap";
  const eyebrow = document.createElement("div");
  eyebrow.className = "lm-eyebrow";
  eyebrow.textContent = areaName || "";
  const title = document.createElement("div");
  title.className = "lm-title";
  title.textContent = entity.label || entity.entityId;
  titleWrap.append(eyebrow, title);
  header.append(closeBtn, titleWrap);

  // --- body -----------------------------------------------------------
  const body = document.createElement("div");
  body.className = "lm-body";

  const percent = document.createElement("div");
  percent.className = "lm-percent";
  const updated = document.createElement("div");
  updated.className = "lm-updated";

  const sliderWrap = document.createElement("div");
  sliderWrap.className = "lm-slider";
  const sliderTrack = document.createElement("div");
  sliderTrack.className = "lm-slider__track";
  const sliderFill = document.createElement("div");
  sliderFill.className = "lm-slider__fill";
  const sliderKnob = document.createElement("div");
  sliderKnob.className = "lm-slider__knob";
  sliderTrack.append(sliderFill, sliderKnob);
  sliderWrap.appendChild(sliderTrack);

  const modes = document.createElement("div");
  modes.className = "lm-modes";
  const powerBtn = pillButton(ICON_POWER, t("Power"));
  modes.appendChild(powerBtn);
  let brightBtn = null;
  let colorBtn = null;
  let tempBtn = null;
  if (cap.hasBrightness) {
    brightBtn = pillButton(ICON_SUN, t("Brightness"));
    brightBtn.dataset.panel = "brightness";
    modes.appendChild(brightBtn);
  }
  if (cap.hasColor) {
    colorBtn = pillButton(ICON_COLOR, t("Color"));
    colorBtn.dataset.panel = "color";
    modes.appendChild(colorBtn);
  }
  if (cap.hasColorTemp) {
    tempBtn = pillButton(ICON_TEMP, t("Color temperature"));
    tempBtn.dataset.panel = "temp";
    modes.appendChild(tempBtn);
  }

  // --- panels ---------------------------------------------------------
  // Brightness panel: vertical slider (created above).
  const brightnessPanel = document.createElement("div");
  brightnessPanel.className = "lm-panel lm-panel--brightness";
  brightnessPanel.append(percent, updated, sliderWrap);

  // Color panel: HS color wheel canvas.
  const colorPanel = document.createElement("div");
  colorPanel.className = "lm-panel lm-panel--color";
  let wheelCanvas = null;
  let wheelKnob = null;
  if (cap.hasColor) {
    const wheelWrap = document.createElement("div");
    wheelWrap.className = "lm-wheel";
    wheelCanvas = document.createElement("canvas");
    wheelCanvas.className = "lm-wheel__canvas";
    wheelCanvas.width = 280;
    wheelCanvas.height = 280;
    drawColorWheel(wheelCanvas);
    wheelKnob = document.createElement("div");
    wheelKnob.className = "lm-wheel__knob";
    wheelWrap.append(wheelCanvas, wheelKnob);
    colorPanel.appendChild(wheelWrap);
    attachWheelDrag(wheelCanvas, wheelKnob, (h, s) => {
      commands.lightTurnOn(entityId, { hs_color: [h, s] }).catch(reportErr);
    });
  }

  // Color-temp panel: horizontal gradient slider.
  const tempPanel = document.createElement("div");
  tempPanel.className = "lm-panel lm-panel--temp";
  let tempTrack = null;
  let tempKnob = null;
  let tempMinK = 2200;
  let tempMaxK = 6500;
  if (cap.hasColorTemp) {
    const a0 = entity.attributes || {};
    tempMinK = a0.min_color_temp_kelvin || (a0.max_mireds ? Math.round(1e6 / a0.max_mireds) : 2200);
    tempMaxK = a0.max_color_temp_kelvin || (a0.min_mireds ? Math.round(1e6 / a0.min_mireds) : 6500);
    const wrap = document.createElement("div");
    wrap.className = "lm-temp";
    tempTrack = document.createElement("div");
    tempTrack.className = "lm-temp__track";
    tempKnob = document.createElement("div");
    tempKnob.className = "lm-temp__knob";
    tempTrack.appendChild(tempKnob);
    wrap.appendChild(tempTrack);
    tempPanel.appendChild(wrap);
    // Render gradient using current min/max kelvin.
    tempTrack.style.background = buildTempGradient(tempMinK, tempMaxK);
    attachTempDrag(tempTrack, tempKnob, tempMinK, tempMaxK, (kelvin) => {
      commands.lightTurnOn(entityId, { color_temp_kelvin: kelvin }).catch(reportErr);
    });
  }

  const panels = document.createElement("div");
  panels.className = "lm-panels";
  panels.append(brightnessPanel, colorPanel, tempPanel);

  // Effect button — only shown if entity advertises effects.
  let effectBtn = null;
  if (cap.hasEffects) {
    effectBtn = document.createElement("button");
    effectBtn.type = "button";
    effectBtn.className = "lm-effect";
    effectBtn.innerHTML = `${ICON_SPARKLE}<span>${t("Effect")}</span>`;
    effectBtn.addEventListener("click", () => openEffectPicker());
  }

  body.append(panels, modes);
  if (effectBtn) body.appendChild(effectBtn);

  // Tab switching ------------------------------------------------------
  const defaultPanel = cap.hasBrightness ? "brightness" : (cap.hasColor ? "color" : (cap.hasColorTemp ? "temp" : "brightness"));
  function setPanel(name) {
    brightnessPanel.hidden = name !== "brightness";
    colorPanel.hidden      = name !== "color";
    tempPanel.hidden       = name !== "temp";
    for (const b of [brightBtn, colorBtn, tempBtn]) {
      if (b) b.classList.toggle("is-active", b.dataset.panel === name);
    }
  }
  setPanel(defaultPanel);
  brightBtn?.addEventListener("click", () => setPanel("brightness"));
  colorBtn?.addEventListener("click", () => setPanel("color"));
  tempBtn?.addEventListener("click", () => setPanel("temp"));

  dialog.append(header, body);
  document.body.appendChild(backdrop);

  // ---- live state ----------------------------------------------------
  function repaint() {
    const e = current;
    const a = e.attributes || {};
    const isOn = e.state === "on";
    const bri = typeof a.brightness === "number"
      ? Math.round((a.brightness / 255) * 100)
      : (isOn ? 100 : 0);

    if (cap.hasBrightness) {
      percent.textContent = isOn ? `${bri}%` : t("Off");
      sliderFill.style.height = `${isOn ? bri : 0}%`;
      sliderWrap.classList.toggle("is-off", !isOn);
    } else {
      percent.textContent = isOn ? t("On") : t("Off");
    }
    updated.textContent = e.lastChanged || e.last_changed
      ? timeAgoText(e.lastChanged || e.last_changed)
      : "";
    powerBtn.classList.toggle("is-active", isOn);

    // Position color-wheel knob from hs_color (or rgb_color converted).
    if (wheelCanvas && wheelKnob && !wheelCanvas._dragging) {
      let h = null, s = null;
      if (Array.isArray(a.hs_color))      { h = a.hs_color[0]; s = a.hs_color[1]; }
      else if (Array.isArray(a.rgb_color)) { const hs = rgbToHs(a.rgb_color); h = hs[0]; s = hs[1]; }
      if (h != null && s != null) positionWheelKnob(wheelCanvas, wheelKnob, h, s);
    }
    // Position color-temp knob.
    if (tempTrack && tempKnob && !tempTrack._dragging) {
      const k = a.color_temp_kelvin || (a.color_temp ? Math.round(1e6 / a.color_temp) : null);
      if (k != null) {
        const pct = Math.max(0, Math.min(1, (k - tempMinK) / Math.max(1, tempMaxK - tempMinK)));
        tempKnob.style.left = `${pct * 100}%`;
      }
    }
  }
  repaint();

  // Subscribe to entity updates while open.
  const unsubscribe = store.subscribe(
    (s) => s.entities[entityId],
    (e) => { if (e) { current = e; repaint(); } },
  );

  // ---- interactions --------------------------------------------------
  function setBrightness(pct) {
    const v = Math.max(0, Math.min(100, Math.round(pct)));
    sliderFill.style.height = `${v}%`;
    percent.textContent = `${v}%`;
    if (v === 0) {
      commands.lightTurnOff(entityId).catch(reportErr);
    } else {
      commands.lightSetBrightnessPct(entityId, v).catch(reportErr);
    }
  }

  let dragging = false;
  function pctFromEvent(ev) {
    const rect = sliderTrack.getBoundingClientRect();
    const y = (ev.touches?.[0]?.clientY ?? ev.clientY) - rect.top;
    return 100 - Math.max(0, Math.min(rect.height, y)) / rect.height * 100;
  }
  function onPointerDown(ev) {
    ev.preventDefault();
    dragging = true;
    sliderTrack.setPointerCapture?.(ev.pointerId);
    setBrightness(pctFromEvent(ev));
  }
  function onPointerMove(ev) {
    if (!dragging) return;
    setBrightness(pctFromEvent(ev));
  }
  function onPointerUp() { dragging = false; }
  if (cap.hasBrightness) {
    sliderTrack.addEventListener("pointerdown", onPointerDown);
    sliderTrack.addEventListener("pointermove", onPointerMove);
    sliderTrack.addEventListener("pointerup", onPointerUp);
    sliderTrack.addEventListener("pointercancel", onPointerUp);
  }

  powerBtn.addEventListener("click", () => {
    commands.lightToggle(entityId).catch(reportErr);
  });

  function openEffectPicker() {
    const list = current.attributes?.effect_list || cap.effects;
    if (!list?.length) return;
    const menu = document.createElement("div");
    menu.className = "lm-menu";
    const currentEffect = current.attributes?.effect;
    for (const eff of list) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lm-menu__item";
      item.textContent = eff;
      if (eff === currentEffect) item.classList.add("is-active");
      item.addEventListener("click", () => {
        commands.lightTurnOn(entityId, { effect: eff }).catch(reportErr);
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

  function reportErr(err) {
    eventBus?.emit?.("toast:show", { message: err?.message || t("Action failed"), tone: "error" });
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

function pillButton(svg, label, active = false) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "lm-pill" + (active ? " is-active" : "");
  b.setAttribute("aria-label", label);
  b.innerHTML = svg;
  return b;
}

function timeAgoText(iso) {
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return "";
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60)  return t("{s} sec ago", { s });
  const m = Math.round(s / 60);
  if (m < 60)  return t("{m} min ago", { m });
  const h = Math.round(m / 60);
  if (h < 24)  return h === 1 ? t("{h} hour ago", { h }) : t("{h} hours ago", { h });
  const d = Math.round(h / 24);
  return d === 1 ? t("{d} day ago", { d }) : t("{d} days ago", { d });
}

// =====================================================================
// Color wheel + temp helpers
// =====================================================================

/**
 * Paint an HSV color wheel (full saturation outer ring, white center) onto a
 * canvas. Uses per-pixel iteration so it works without any libraries.
 */
function drawColorWheel(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2, r = Math.min(cx, cy);
  const img = ctx.createImageData(w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * w + x) * 4;
      if (dist > r) { data[i + 3] = 0; continue; }
      // Hue: 0° at right (east), increasing clockwise so it matches HA.
      let hue = Math.atan2(dy, dx) * 180 / Math.PI;
      if (hue < 0) hue += 360;
      const sat = Math.min(1, dist / r);
      const [rr, gg, bb] = hsvToRgb(hue, sat, 1);
      data[i]     = rr;
      data[i + 1] = gg;
      data[i + 2] = bb;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function attachWheelDrag(canvas, knob, onChange) {
  const onPick = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const x = (ev.touches?.[0]?.clientX ?? ev.clientX) - rect.left;
    const y = (ev.touches?.[0]?.clientY ?? ev.clientY) - rect.top;
    const cx = rect.width / 2, cy = rect.height / 2;
    const dx = x - cx, dy = y - cy;
    const r = Math.min(cx, cy);
    let dist = Math.sqrt(dx * dx + dy * dy);
    // Clamp to circle.
    if (dist > r) dist = r;
    let hue = Math.atan2(dy, dx) * 180 / Math.PI;
    if (hue < 0) hue += 360;
    const sat = Math.round((dist / r) * 100);
    const px = cx + Math.cos(hue * Math.PI / 180) * dist;
    const py = cy + Math.sin(hue * Math.PI / 180) * dist;
    knob.style.left = `${(px / rect.width) * 100}%`;
    knob.style.top  = `${(py / rect.height) * 100}%`;
    onChange(Math.round(hue), sat);
  };
  let pending = null;
  const throttled = (ev) => {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { pending = null; onPick(ev); });
  };
  canvas.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    canvas._dragging = true;
    canvas.setPointerCapture?.(ev.pointerId);
    onPick(ev);
  });
  canvas.addEventListener("pointermove", (ev) => { if (canvas._dragging) throttled(ev); });
  const stop = () => { canvas._dragging = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

function positionWheelKnob(canvas, knob, hue, sat) {
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  const cx = w / 2, cy = h / 2;
  const r = Math.min(cx, cy);
  const dist = (sat / 100) * r;
  const px = cx + Math.cos(hue * Math.PI / 180) * dist;
  const py = cy + Math.sin(hue * Math.PI / 180) * dist;
  knob.style.left = `${(px / w) * 100}%`;
  knob.style.top  = `${(py / h) * 100}%`;
}

function buildTempGradient(minK, maxK) {
  // Sample a handful of kelvins and convert to RGB to build a CSS gradient.
  const stops = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const k = minK + (maxK - minK) * (i / steps);
    const [r, g, b] = kelvinToRgb(k);
    stops.push(`rgb(${r}, ${g}, ${b}) ${(i / steps) * 100}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function attachTempDrag(track, knob, minK, maxK, onChange) {
  const onPick = (ev) => {
    const rect = track.getBoundingClientRect();
    const x = (ev.touches?.[0]?.clientX ?? ev.clientX) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    knob.style.left = `${pct * 100}%`;
    const kelvin = Math.round(minK + (maxK - minK) * pct);
    onChange(kelvin);
  };
  let pending = null;
  const throttled = (ev) => {
    if (pending) cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => { pending = null; onPick(ev); });
  };
  track.addEventListener("pointerdown", (ev) => {
    ev.preventDefault();
    track._dragging = true;
    track.setPointerCapture?.(ev.pointerId);
    onPick(ev);
  });
  track.addEventListener("pointermove", (ev) => { if (track._dragging) throttled(ev); });
  const stop = () => { track._dragging = false; };
  track.addEventListener("pointerup", stop);
  track.addEventListener("pointercancel", stop);
}

// HSV → RGB (h in degrees, s/v in 0..1) → 0..255 ints.
function hsvToRgb(h, s, v) {
  const c = v * s;
  const hh = (h % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r1 = 0, g1 = 0, b1 = 0;
  if      (hh < 1) { r1 = c; g1 = x; }
  else if (hh < 2) { r1 = x; g1 = c; }
  else if (hh < 3) { g1 = c; b1 = x; }
  else if (hh < 4) { g1 = x; b1 = c; }
  else if (hh < 5) { r1 = x; b1 = c; }
  else             { r1 = c; b1 = x; }
  const m = v - c;
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ];
}

function rgbToHs([r, g, b]) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if      (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else                 h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : (d / max) * 100;
  return [h, s];
}

// Approximate Tanner Helland's algorithm for color temperature in Kelvin → RGB.
function kelvinToRgb(kelvin) {
  const k = kelvin / 100;
  let r, g, b;
  // Red
  if (k <= 66) r = 255;
  else { r = 329.698727446 * Math.pow(k - 60, -0.1332047592); }
  // Green
  if (k <= 66) g = 99.4708025861 * Math.log(k) - 161.1195681661;
  else         g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  // Blue
  if (k >= 66)      b = 255;
  else if (k <= 19) b = 0;
  else              b = 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return [
    Math.max(0, Math.min(255, Math.round(r))),
    Math.max(0, Math.min(255, Math.round(g))),
    Math.max(0, Math.min(255, Math.round(b))),
  ];
}

// =====================================================================
// Inline SVG icons (tiny set, currentColor)
// =====================================================================
const ICON_X = svg(`<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`);
const ICON_HISTORY = svg(`<path d="M3 14h4v6M5 18a8 8 0 1 0 .8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`);
const ICON_SETTINGS = svg(`<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4.9a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.5a7 7 0 0 0-2.1 1.2l-2.4-.9-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-.9a7 7 0 0 0 2.1 1.2L10 21h4l.4-2.5a7 7 0 0 0 2.1-1.2l2.4.9 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" stroke="currentColor" stroke-width="2" fill="none"/>`);
const ICON_MORE = svg(`<circle cx="12" cy="6" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="18" r="1.5" fill="currentColor"/>`);
const ICON_POWER = svg(`<path d="M12 3v9M7 6.5a8 8 0 1 0 10 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>`);
const ICON_SUN = svg(`<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`);
const ICON_COLOR = svgRaw(`<defs><linearGradient id="lmcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff5a50"/><stop offset="33%" stop-color="#ffd24d"/><stop offset="66%" stop-color="#4dd17a"/><stop offset="100%" stop-color="#508cff"/></linearGradient></defs><circle cx="12" cy="12" r="8" fill="url(#lmcg)"/>`);
const ICON_TEMP = svgRaw(`<defs><linearGradient id="lmtg" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#ffd29a"/><stop offset="100%" stop-color="#dfeeff"/></linearGradient></defs><circle cx="12" cy="12" r="8" fill="url(#lmtg)"/>`);
const ICON_SPARKLE = svg(`<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3zM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14z" fill="currentColor"/>`);
const ICON_BULB = svg(`<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3 11.2V16h6v-1.8A6 6 0 0 0 12 3z" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

function svg(inner) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${inner}</svg>`;
}
function svgRaw(inner) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${inner}</svg>`;
}
