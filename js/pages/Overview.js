import { BaseComponent } from "../components/base/BaseComponent.js";
import { PageShell } from "../components/layout/PageShell.js";
import { Loader } from "../components/ui/Loader.js";
import { Tile } from "../components/cards/Tile.js";
import { openLightModal } from "../components/cards/LightModal.js";
import { openMediaModal } from "../components/cards/MediaModal.js";
import {
  getByDomain, getInArea, findEntity,
} from "../api/ha-selectors.js";
import { selectEntities, selectReady } from "../state/store.js";
import { storage, STORAGE_KEYS } from "../core/storage.js";
import { t } from "../core/i18n.js";

/**
 * Oversigtssiden modellerer HA's eget dashboard:
 *
 *   ┌─────────────────────┬─────────┬─────────┐
 *   │ Vejr (5h forecast)  │ Affald  │ Alarm   │
 *   ├─────────────────────┼─────────┴─────────┤
 *   │ Favoritter (scener) │ Kalender          │
 *   ├─────────────────────┼───────────────────┤
 *   │ Rum: Stuen          │ Rum: Køkkenet     │
 *   └─────────────────────┴───────────────────┘
 *
 * Sektionerne forsvinder pænt hvis der ikke findes matchende entiteter,
 * så siden er brugbar uden manuel konfiguration.
 */
export class Overview extends BaseComponent {
  render() {
    this._shell = new PageShell({
      title: t("Home"),
      subtitle: t("A quick look at your home"),
    });
    const root = document.createElement("div");
    this._shell.mount(root);

    this._grid = document.createElement("div");
    this._grid.className = "dash-grid";
    this._shell.body.appendChild(this._grid);

    this._renderContent(this.props.store.getState());
    return root.firstElementChild;
  }

  onMount() {
    const { store, eventBus, ws } = this.props;
    this.subscribe(store, selectEntities, () => this._renderContent(store.getState()));
    this.subscribe(store, selectReady,    (ready) => {
      this._renderContent(store.getState());
      // Hent kalender + vejr så snart WS er klar (eller efter reconnect).
      if (ready) {
        this._refreshCalendarCache();
        this._refreshForecastCache();
      }
    });
    // Indstillinger kan toggle synlige rum \u2014 re-render n\u00e5r det sker.
    this.on(eventBus, "oversigt:rooms-changed", () => {
      // Kalenderen \u00e6ndrer sig potentielt n\u00e5r brugeren skjuler/viser kalendere.
      this._calendarEvents = null;
      this._refreshCalendarCache();
      this._renderContent(store.getState());
    });
    // Første hent af kalender + vejr; refreshes hver 5./10. min.
    this._refreshCalendarCache();
    this._refreshForecastCache();
    this._calTimer = setInterval(() => this._refreshCalendarCache(), 5 * 60 * 1000);
    this._wxTimer  = setInterval(() => this._refreshForecastCache(), 10 * 60 * 1000);
  }

  onUnmount() {
    if (this._calTimer) { clearInterval(this._calTimer); this._calTimer = null; }
    if (this._wxTimer)  { clearInterval(this._wxTimer);  this._wxTimer  = null; }
  }

  _renderContent(state) {
    this._grid.replaceChildren();

    if (!state.ready && Object.keys(state.entities).length === 0) {
      const wrap = document.createElement("div");
      wrap.className = "dash-area";
      new Loader({ kind: "skeleton", lines: 4 }).mount(wrap);
      this._grid.appendChild(wrap);
      return;
    }

    const { store, commands, eventBus, ws } = this.props;

    // ---- Row 1 ----------------------------------------------------------
    // Brug en fast forecast-entitet hvis brugeren har den, ellers fald tilbage
    // til hvilken som helst weather.*
    const weather = state.entities["weather.forecast_hjem"]
                 || findEntity(state, /^weather\./);
    if (weather) {
      const card = renderWeatherCard(weather, this._forecast);
      this._grid.appendChild(card);
    }

    const hiddenWaste = new Set(loadHidden("waste"));
    const wasteSensors = pickWasteSensors(state).filter((w) => !hiddenWaste.has(w.entity.entityId));
    if (wasteSensors.length) this._grid.appendChild(renderWasteCard(wasteSensors));

    const hiddenAlarm = new Set(loadHidden("alarm"));
    const alarm = getByDomain(state, "alarm_control_panel").find((e) => !hiddenAlarm.has(e.entityId));
    if (alarm) this._grid.appendChild(renderAlarmCard(alarm, commands, eventBus));

    // ---- Row 2 ----------------------------------------------------------
    const hiddenFavs = new Set(loadHidden("favorites"));
    const favs = pickFavorites(state).filter((f) => !hiddenFavs.has(f.entity.entityId));
    if (favs.length) this._grid.appendChild(renderFavoritesCard(favs, commands, eventBus));

    const hiddenCals = new Set(loadHidden("calendar"));
    const calendars = getByDomain(state, "calendar").filter((c) => !hiddenCals.has(c.entityId));
    if (calendars.length) this._grid.appendChild(renderCalendarCard(calendars, this._calendarEvents));

    // ---- Rum: alle med togglebare entiteter, filtreret af brugeren -------
    const hiddenRooms = new Set(loadHidden("rooms"));
    const roomAreas = pickRoomsForOversigt(state).filter((r) => !hiddenRooms.has(r.area.id));
    for (const area of roomAreas) {
      this._grid.appendChild(renderRoomCard(area, state, commands, eventBus, store));
    }

    if (this._grid.childElementCount === 0) {
      const empty = document.createElement("div");
      empty.className = "dash-area empty";
      empty.textContent = t("No known entities yet.");
      this._grid.appendChild(empty);
    }
  }

  /**
   * Hent forecast via weather.get_forecasts (return_response) og gem på
   * instansen, så vi kun rammer service-kaldet én gang (+ periodisk),
   * ikke ved hver entity-state-ændring.
   */
  async _refreshForecastCache() {
    const { ws, store } = this.props;
    const state = store.getState();
    const weather = state.entities["weather.forecast_hjem"]
                 || findEntity(state, /^weather\./);
    if (!weather) return;
    try {
      const resp = await ws.sendMessage({
        type: "call_service",
        domain: "weather",
        service: "get_forecasts",
        service_data: { type: "hourly" },
        target: { entity_id: weather.entityId },
        return_response: true,
      });
      const forecast = resp?.response?.[weather.entityId]?.forecast;
      if (!Array.isArray(forecast) || forecast.length === 0) return;
      this._forecast = { entityId: weather.entityId, items: forecast };
      this._renderContent(store.getState());
    } catch {
      // Stille fejl — vi viser bare uden forecast.
    }
  }

  /**
   * Hent kommende events for de n\u00e6ste 3 dage fra alle valgte kalendere
   * og gem dem p\u00e5 instansen. Trigger re-render n\u00e5r resultatet er klar,
   * s\u00e5 _renderContent kan inkludere dem.
   */
  async _refreshCalendarCache() {
    const { ws, store } = this.props;
    const state = store.getState();
    const hidden = new Set(loadHidden("calendar"));
    const calendars = getByDomain(state, "calendar").filter((c) => !hidden.has(c.entityId));
    if (calendars.length === 0) { this._calendarEvents = []; return; }
    const start = new Date();
    const end   = new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000);
    try {
      const resp = await ws.sendMessage({
        type: "call_service",
        domain: "calendar",
        service: "get_events",
        service_data: {
          start_date_time: toLocalISO(start),
          end_date_time:   toLocalISO(end),
        },
        target: { entity_id: calendars.map((c) => c.entityId) },
        return_response: true,
      });
      const out = [];
      for (const cal of calendars) {
        const events = resp?.response?.[cal.entityId]?.events ?? [];
        for (const ev of events) {
          out.push({
            title:    ev.summary || cal.label || cal.entityId,
            location: ev.location,
            start:    ev.start,
            end:      ev.end,
            allDay:   isAllDay(ev),
          });
        }
      }
      out.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
      this._calendarEvents = out;
      this._renderContent(store.getState());
    } catch {
      // Stille fejl \u2014 vi viser bare attribut-baseret "n\u00e6ste event".
    }
  }
}

/** ISO-string uden zone, som HA's calendar.get_events forventer. */
function toLocalISO(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** En event er heldags hvis start/end ikke har klokkesl\u00e6t. */
function isAllDay(ev) {
  const s = ev.start || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// =====================================================================
// Weather
// =====================================================================

const WEATHER_EMOJI = {
  "clear-night": "\u{1F319}",
  sunny:         "\u2600\uFE0F",
  cloudy:        "\u2601\uFE0F",
  partlycloudy:  "\u26C5",
  fog:           "\u{1F32B}\uFE0F",
  hail:          "\u{1F9CA}",
  lightning:     "\u26C8\uFE0F",
  "lightning-rainy": "\u26C8\uFE0F",
  pouring:       "\u{1F327}\uFE0F",
  rainy:         "\u{1F326}\uFE0F",
  snowy:         "\u{1F328}\uFE0F",
  "snowy-rainy": "\u{1F328}\uFE0F",
  windy:         "\u{1F32C}\uFE0F",
  exceptional:   "\u26A0\uFE0F",
};
const WEATHER_LABEL = {
  "clear-night": "Clear night",
  sunny: "Sunny",
  cloudy: "Cloudy",
  partlycloudy: "Partly cloudy",
  fog: "Fog",
  hail: "Hail",
  lightning: "Thunder",
  "lightning-rainy": "Thunderstorm",
  pouring: "Heavy rain",
  rainy: "Rain",
  snowy: "Snow",
  "snowy-rainy": "Sleet",
  windy: "Windy",
  exceptional: "Unusual weather",
};

function renderWeatherCard(entity, cachedForecast) {
  const card = document.createElement("div");
  card.className = "dash-weather dash-card";

  const a = entity.attributes || {};
  const head = document.createElement("div");
  head.className = "weather-head";
  head.innerHTML = `
    <div class="weather-emoji">${WEATHER_EMOJI[entity.state] ?? "\u2601\uFE0F"}</div>
    <div>
      <div class="weather-title">${escape(t(WEATHER_LABEL[entity.state] ?? entity.state))}</div>
      <div class="weather-sub">${escape(entity.label || entity.entityId)}</div>
    </div>
    <div class="weather-temp">
      <div class="weather-temp-main">${fmtTemp(a.temperature, a.temperature_unit)}</div>
      <div class="weather-temp-sub">${fmtTemp(a.templow ?? a.forecast?.[0]?.templow, a.temperature_unit)} / ${fmtTemp(a.forecast?.[0]?.temperature, a.temperature_unit)}</div>
    </div>`;
  card.appendChild(head);

  // Foretræk cache fra get_forecasts; fald tilbage til attribut-baseret forecast.
  let forecast = null;
  if (cachedForecast?.entityId === entity.entityId && Array.isArray(cachedForecast.items)) {
    forecast = cachedForecast.items.slice(0, 5);
  } else if (Array.isArray(a.forecast)) {
    forecast = a.forecast.slice(0, 5);
  }
  if (forecast?.length) card.appendChild(renderForecastGrid(forecast, a.temperature_unit));
  return card;
}

function renderForecastGrid(forecast, unit) {
  const grid = document.createElement("div");
  grid.className = "weather-forecast";
  for (const f of forecast) {
    const cell = document.createElement("div");
    cell.className = "wf";
    cell.innerHTML = `
      <div class="wf-time">${fmtForecastTime(f.datetime)}</div>
      <div class="wf-icon">${WEATHER_EMOJI[f.condition] ?? "\u2601\uFE0F"}</div>
      <div class="wf-temp">${fmtTemp(f.temperature, unit)}</div>`;
    grid.appendChild(cell);
  }
  return grid;
}

function fmtTemp(v, unit = "\u00b0C") {
  if (v == null || isNaN(v)) return "\u2014";
  const u = unit ? unit.replace("\u00b0", "\u00b0") : "\u00b0C";
  return `${Number(v).toLocaleString("da-DK", { maximumFractionDigits: 1 })}\u00a0${u}`;
}

function fmtForecastTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(+d)) return "";
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

// =====================================================================
// Affald
// =====================================================================

const WASTE_PATTERNS = [
  { rx: /(restaffald|rest_og_mad|madaffald|husholdning)/i, icon: "\u{1F5D1}\uFE0F", name: "Food and rest" },
  { rx: /(pap)\b/i,                                       icon: "\u{1F4E6}",      name: "Cardboard" },
  { rx: /(plast|papir)/i,                                 icon: "\u{1F5D1}\uFE0F", name: "Plastic and paper" },
  { rx: /(glas|metal)/i,                                  icon: "\u267B\uFE0F",   name: "Glass/metal" },
  { rx: /(haveaffald|have)/i,                             icon: "\u{1F33F}",      name: "Garden waste" },
  { rx: /(farligt)/i,                                     icon: "\u2697\uFE0F",   name: "Hazardous waste" },
];

function pickWasteSensors(state) {
  const out = [];
  const seen = new Set();
  for (const e of getByDomain(state, "sensor")) {
    const id = e.entityId.toLowerCase();
    const label = (e.label || "").toLowerCase();
    if (!/(affald|skral|pap|plast|haveaffald|restaffald)/.test(id + label)) continue;
    for (const p of WASTE_PATTERNS) {
      if ((p.rx.test(id) || p.rx.test(label)) && !seen.has(p.name)) {
        out.push({ entity: e, ...p });
        seen.add(p.name);
        break;
      }
    }
  }
  // Tilf\u00f8j energiforbrug hvis vi har det \u2014 matcher screenshottet.
  const energy = findEntity(state, /(daily|today).*(energy|energi)|energi.*(i_dag|today)/i)
              || findEntity(state, /^sensor\..*energy_today/i);
  if (energy) out.push({ entity: energy, icon: "\u26A1", name: energy.label || t("Energy today") });
  return out;
}

function renderWasteCard(items) {
  const card = document.createElement("div");
  card.className = "dash-waste dash-card";
  const head = document.createElement("h3");
  head.className = "dash-section-meta";
  head.style.margin = "0";
  head.style.fontWeight = "600";
  head.textContent = t("Waste");
  card.appendChild(head);

  const list = document.createElement("div");
  list.className = "waste-list";
  for (const { entity, icon, name } of items) {
    const row = document.createElement("div");
    row.className = "waste-row";
    const sub = wasteSubLabel(entity);
    if (sub.due) row.classList.add(sub.due === "now" ? "is-due" : "is-soon");
    row.innerHTML = `
      <span class="waste-icon">${icon}</span>
      <div class="waste-body">
        <div class="waste-name">${escape(t(name))}</div>
        <div class="waste-sub">${escape(sub.text)}</div>
      </div>`;
    list.appendChild(row);
  }
  card.appendChild(list);
  return card;
}

function wasteSubLabel(entity) {
  const s = entity.state;
  const unit = entity.attributes?.unit_of_measurement;
  if (s == null || s === "unknown") return { text: t("unknown") };
  const n = Number(s);
  if (!isNaN(n) && unit) {
    if (/day|dag/i.test(unit)) {
      if (n <= 0) return { text: t("Today"), due: "now" };
      if (n <= 2) return { text: t("{n} days", { n }), due: "soon" };
      return { text: t("{n} days", { n }) };
    }
    return { text: `${n.toLocaleString("da-DK")} ${unit}` };
  }
  return { text: String(s) };
}

// =====================================================================
// Alarm panel
// =====================================================================

const ALARM_MODES = [
  { state: "disarmed",            icon: "\u{1F6AB}", label: "Disarm",    service: "alarm_disarm" },
  { state: "armed_home",          icon: "\u{1F6E1}", label: "Home (alarm)",     service: "alarm_arm_home" },
  { state: "armed_away",          icon: "\u2708\uFE0F", label: "Away", service: "alarm_arm_away" },
  { state: "armed_night",         icon: "\u{1F319}", label: "Night",        service: "alarm_arm_night" },
  { state: "armed_vacation",      icon: "\u{1F3D6}\uFE0F", label: "Vacation", service: "alarm_arm_vacation" },
  { state: "armed_custom_bypass", icon: "\u{1F3E0}", label: "Home (alarm)",       service: "alarm_arm_custom_bypass" },
];

function renderAlarmCard(entity, commands, eventBus) {
  const card = document.createElement("div");
  card.className = "dash-alarm dash-card alarm-card";

  const head = document.createElement("div");
  head.className = "alarm-head";
  head.innerHTML = `
    <div style="flex:1; min-width:0;">
      <div class="alarm-name">${escape(entity.label || entity.entityId)}</div>
      <div class="alarm-sub">${alarmStatusText(entity)}</div>
    </div>
    <div class="alarm-mode is-active" aria-hidden="true">${ALARM_MODES.find(m => m.state === entity.state)?.icon ?? "\u{1F3E0}"}</div>`;
  card.appendChild(head);

  const modes = document.createElement("div");
  modes.className = "alarm-modes";
  for (const m of ALARM_MODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "alarm-mode" + (entity.state === m.state ? " is-active" : "");
    btn.title = t(m.label);
    btn.textContent = m.icon;
    btn.addEventListener("click", async () => {
      try {
        await commands.callService("alarm_control_panel", m.service, {}, { entity_id: entity.entityId });
      } catch (e) {
        eventBus.emit("toast:show", { message: e.message || t("Alarm action failed"), tone: "error" });
      }
    });
    modes.appendChild(btn);
  }
  card.appendChild(modes);
  return card;
}

function alarmStatusText(entity) {
  const map = {
    disarmed: t("Disarmed"),
    armed_home: t("Home (alarm)"),
    armed_away: t("Away"),
    armed_night: t("Night"),
    armed_vacation: t("Vacation"),
    armed_custom_bypass: t("Home (alarm)"),
    arming: t("Arming…"),
    pending: t("Pending…"),
    triggered: t("Triggered"),
  };
  const last = entity.lastUpdated || entity.last_updated;
  const ago = last ? `, ${timeAgo(last)}` : "";
  return `${map[entity.state] ?? entity.state}${ago}`;
}

function timeAgo(iso) {
  const t2 = new Date(iso).getTime();
  if (isNaN(t2)) return "";
  const s = Math.max(1, Math.round((Date.now() - t2) / 1000));
  if (s < 60)  return t("{s} sec ago", { s });
  const m = Math.round(s / 60);
  if (m < 60)  return t("{m} min ago", { m });
  const h = Math.round(m / 60);
  if (h < 24)  return h === 1 ? t("{h} hour ago", { h }) : t("{h} hours ago", { h });
  const d = Math.round(h / 24);
  return d === 1 ? t("{d} day ago", { d }) : t("{d} days ago", { d });
}

// =====================================================================
// Favoritter (scener + input_boolean med kendte navne)
// =====================================================================

const FAV_PATTERNS = [
  { rx: /godnat|night/i,      icon: "\u{1F319}", name: "Good night" },
  { rx: /fest|party/i,        icon: "\u{1F389}", name: "Party" },
  { rx: /ferie|vacation/i,    icon: "\u{1F3D6}\uFE0F", name: "Vacation" },
  { rx: /hjemme|home/i,       icon: "\u{1F464}", name: "Home" },
  { rx: /film|movie|biograf/i, icon: "\u{1F3AC}", name: "Movie night" },
  { rx: /aften|evening/i,     icon: "\u{1F305}", name: "Evening" },
  { rx: /morgen|morning/i,    icon: "\u{1F305}", name: "Morgen" },
];

function pickFavorites(state) {
  const candidates = [
    ...getByDomain(state, "input_boolean"),
    ...getByDomain(state, "scene"),
    ...getByDomain(state, "script"),
  ];
  const out = [];
  for (const e of candidates) {
    const t = (e.entityId + " " + (e.label || "")).toLowerCase();
    const match = FAV_PATTERNS.find((p) => p.rx.test(t));
    if (match) out.push({ entity: e, icon: match.icon, name: match.name });
    if (out.length >= 8) break;
  }
  return out;
}

function renderFavoritesCard(items, commands, eventBus) {
  const card = document.createElement("div");
  card.className = "dash-favs dash-card";
  const head = document.createElement("h3");
  head.style.margin = "0";
  head.style.fontWeight = "600";
  head.textContent = t("Favorites");
  card.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "fav-grid";
  for (const { entity, icon, name } of items) {
    const isOn = entity.state === "on";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fav-tile" + (isOn ? " is-on" : "");
    btn.innerHTML = `
      <span class="fav-emoji">${icon}</span>
      <div class="fav-body">
        <div class="fav-name">${escape(t(name))}</div>
        <div class="fav-state">${isOn ? t("On") : t("Off")}</div>
      </div>`;
    btn.addEventListener("click", async () => {
      try {
        const domain = entity.entityId.split(".")[0];
        const service = domain === "scene" || domain === "script" ? "turn_on" : "toggle";
        await commands.callService(domain, service, {}, { entity_id: entity.entityId });
      } catch (e) {
        eventBus.emit("toast:show", { message: e.message || t("Action failed"), tone: "error" });
      }
    });
    grid.appendChild(btn);
  }
  card.appendChild(grid);
  return card;
}

// =====================================================================
// Kalender
// =====================================================================

function renderCalendarCard(calendars, cachedEvents) {
  const card = document.createElement("div");
  card.className = "dash-calendar dash-card";
  const head = document.createElement("h3");
  head.style.margin = "0";
  head.style.fontWeight = "600";
  head.textContent = t("Calendar (next 3 days)");
  card.appendChild(head);

  // Foretr\u00e6k cache fra get_events; fald tilbage til attribut-baseret "n\u00e6ste event"
  // hvis cachen endnu ikke er hentet.
  let events = cachedEvents;
  if (!Array.isArray(events)) {
    events = [];
    for (const cal of calendars) {
      const a = cal.attributes || {};
      if (a.message || a.start_time) {
        events.push({
          title:    a.message || cal.label || cal.entityId,
          location: a.location,
          start:    a.start_time,
          end:      a.end_time,
          allDay:   a.all_day,
        });
      }
    }
    events.sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  }

  if (events.length === 0) {
    const p = document.createElement("p");
    p.style.color = "var(--color-text-2)";
    p.style.fontSize = "var(--fs-sm)";
    p.textContent = t("No events in the next 3 days.");
    card.appendChild(p);
    return card;
  }

  for (const ev of events) card.appendChild(renderEventRow(ev));
  return card;
}

function renderEventRow(ev) {
  const row = document.createElement("div");
  row.className = "cal-event";
  const d = ev.start ? new Date(ev.start.replace(" ", "T")) : null;
  const dow   = d ? d.toLocaleDateString("da-DK", { weekday: "short" }) : "";
  const day   = d ? d.getDate() : "";
  const month = d ? d.toLocaleDateString("da-DK", { month: "short" }).toUpperCase() : "";
  const t1    = ev.start && !ev.allDay ? fmtTime(ev.start) : "";
  const t2    = ev.end   && !ev.allDay ? fmtTime(ev.end)   : "";
  row.innerHTML = `
    <div class="cal-date">
      <div class="cal-dow">${dow}</div>
      <div class="cal-day">${day}</div>
      <div class="cal-month">${month}</div>
    </div>
    <div class="cal-body">
      <div class="cal-title">${escape(ev.title || "")}</div>
      <div class="cal-time">${ev.allDay ? t("All day") : `${t1}${t2 ? " – " + t2 : ""}`}</div>
      ${ev.location ? `<div class="cal-loc">\u{1F4CD} ${escape(ev.location)}</div>` : ""}
    </div>`;
  return row;
}
function fmtTime(s) {
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(+d) ? "" : d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

// =====================================================================
// Rum
// =====================================================================

function pickRoomsForOversigt(state) {
  const rooms = [];
  for (const area of Object.values(state.areas || {})) {
    const ents  = getInArea(state, area.id);
    const tiles = ents.filter((e) => /^(light|switch|media_player|climate|cover|lock)\./.test(e.entityId));
    if (tiles.length === 0) continue;
    rooms.push({ area, ents, tiles });
  }
  // Sortering: flest tiles f\u00f8rst (s\u00e5 brugeren ser de aktive rum f\u00f8rst).
  rooms.sort((a, b) => b.tiles.length - a.tiles.length || a.area.name.localeCompare(b.area.name));
  return rooms;
}

/** Eksporteret så IndstillingerPage kan bygge sin liste över rum.
 *  Returnerer ALLE kendte rum (også dem uden tile-bare entiteter), så
 *  brugeren kan se hele sit hjem og vælge per-rum. `entityCount` t\u00e6ller
 *  alle entiteter knyttet til rummet (matcher popup'ens kandidat-liste).
 */
export function listRoomsWithEntities(state) {
  const areas = Object.values(state.areas || {});
  return areas
    .map((area) => ({
      id: area.id,
      name: area.name,
      entityCount: getInArea(state, area.id).length,
    }))
    // Rum med entiteter først, derefter alfabetisk.
    .sort((a, b) => (b.entityCount > 0) - (a.entityCount > 0) || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------
// Generic hidden-set helpers brugt af Indstillinger.
//
// "section" matcher én af nedenst\u00e5ende n\u00f8gler. Hver sektion gemmer en
// array af ID'er der skal skjules \u2014 default visning er "alt synligt".
// ---------------------------------------------------------------------

const HIDDEN_KEYS = {
  rooms:     STORAGE_KEYS.OVERSIGT_HIDDEN_ROOMS,
  waste:     STORAGE_KEYS.OVERSIGT_HIDDEN_WASTE,
  alarm:     STORAGE_KEYS.OVERSIGT_HIDDEN_ALARM,
  favorites: STORAGE_KEYS.OVERSIGT_HIDDEN_FAVS,
  calendar:  STORAGE_KEYS.OVERSIGT_HIDDEN_CALENDAR,
};

export function loadHidden(section) {
  const key = HIDDEN_KEYS[section];
  if (!key) return [];
  return storage.get(key, []) || [];
}
export function saveHidden(section, ids) {
  const key = HIDDEN_KEYS[section];
  if (!key) return;
  storage.set(key, Array.from(new Set(ids)));
}

// Bagudkompatibilitet for IndstillingerPage's f\u00f8rste version.
export function loadHiddenRooms() { return loadHidden("rooms"); }
export function saveHiddenRooms(ids) { saveHidden("rooms", ids); }

/** Kandidat-listere brugt af Indstillinger \u2014 alle returnerer {id, name, hint?}. */
export function listWasteCandidates(state) {
  return pickWasteSensors(state).map(({ entity, name }) => ({
    id: entity.entityId,
    name,
    hint: entity.label || entity.entityId,
  }));
}
export function listAlarmCandidates(state) {
  return getByDomain(state, "alarm_control_panel").map((e) => ({
    id: e.entityId,
    name: e.label || e.entityId,
    hint: e.entityId,
  }));
}
export function listFavoriteCandidates(state) {
  return pickFavorites(state).map(({ entity, name }) => ({
    id: entity.entityId,
    name,
    hint: entity.entityId,
  }));
}
export function listCalendarCandidates(state) {
  return getByDomain(state, "calendar").map((e) => ({
    id: e.entityId,
    name: e.label || e.entityId,
    hint: e.entityId,
  }));
}

/**
 * Kandidat-entiteter for et givet rum. Returnerer ALLE entiteter knyttet
 * til rummet, så brugeren kan vælge frit hvad der vises som tiles på
 * Oversigt-siden. Sorteres: tile-bare domæner først, derefter alfabetisk.
 */
export function listRoomEntityCandidates(state, areaId) {
  const ents = getInArea(state, areaId);
  const tileRx = /^(light|switch|media_player|climate|cover|lock)\./;
  return ents
    .map((e) => ({
      id: e.entityId,
      name: e.label || e.entityId,
      hint: `${iconForDomain(e.entityId)} ${e.entityId}`,
      _tile: tileRx.test(e.entityId),
    }))
    .sort((a, b) => (b._tile - a._tile) || a.name.localeCompare(b.name))
    .map(({ _tile, ...rest }) => rest);
}

/**
 * Kandidat-devices for et givet rum. Hvert device samler alle de
 * entiteter HA har knyttet til devicet (vi bruger device-navnet som
 * row-label og gemmer entity-id'erne så Oversigt kan filtrere på dem).
 * Entiteter uden device samles under en pseudo-device "Andre".
 */
export function listRoomDeviceCandidates(state, areaId) {
  const ents = getInArea(state, areaId);
  const devReg   = state.devices       || {};
  const entToDev = state.entityDevice  || {};
  const groups = new Map(); // deviceId|"__none__" → { id, name, entityIds[] }
  for (const e of ents) {
    const devId = entToDev[e.entityId] || "__none__";
    if (!groups.has(devId)) {
      const dev = devReg[devId];
      groups.set(devId, {
        id: devId,
        name: dev?.name || (devId === "__none__" ? t("Other") : devId),
        entityIds: [],
      });
    }
    groups.get(devId).entityIds.push(e.entityId);
  }
  return [...groups.values()]
    .map((g) => ({
      id:   g.id,
      name: g.name,
      hint: `${g.entityIds.length} ${g.entityIds.length === 1 ? t("entity") : t("entities")}`,
      entityIds: g.entityIds,
    }))
    // "Andre" til sidst, ellers alfabetisk.
    .sort((a, b) => (a.id === "__none__") - (b.id === "__none__") || a.name.localeCompare(b.name));
}

/** Per-rum skjulte entiteter: gemmes som `{ [areaId]: [entityId, ...] }`. */
export function loadHiddenRoomEntities(areaId) {
  const all = storage.get(STORAGE_KEYS.OVERSIGT_ROOM_ENTITIES, {}) || {};
  return Array.isArray(all[areaId]) ? all[areaId] : [];
}
export function saveHiddenRoomEntities(areaId, ids) {
  const all = storage.get(STORAGE_KEYS.OVERSIGT_ROOM_ENTITIES, {}) || {};
  all[areaId] = Array.from(new Set(ids));
  storage.set(STORAGE_KEYS.OVERSIGT_ROOM_ENTITIES, all);
}

function iconForDomain(entityId) {
  const dom = entityId.split(".")[0];
  return ({
    light:        "\u{1F4A1}",
    switch:       "\u{1F50C}",
    media_player: "\u{1F4FA}",
    climate:      "\u{1F321}\uFE0F",
    cover:        "\u{1FA9F}",
    lock:         "\u{1F510}",
  })[dom] || "\u2728";
}

function renderRoomCard({ area, ents, tiles }, _state, commands, eventBus, store) {
  const card = document.createElement("div");
  card.className = "dash-room dash-card";

  // Brugeren kan vælge fra under Indstillinger hvilke entiteter der vises i rummet.
  const hiddenEnts = new Set(loadHiddenRoomEntities(area.id));
  const visibleTiles = tiles.filter((e) => !hiddenEnts.has(e.entityId));

  const head = document.createElement("button");
  head.type = "button";
  head.className = "room-head room-head--link";
  head.addEventListener("click", () => { window.location.hash = `/rum/${encodeURIComponent(area.id)}`; });

  // Badges: media-on + lights-on count, og første sensor (temp) hvis nogen
  const lightsOn = visibleTiles.filter((e) => e.entityId.startsWith("light.") && e.state === "on").length;
  const mediaOn  = visibleTiles.find((e) => e.entityId.startsWith("media_player.") && e.state === "playing");
  const temp     = ents.find((e) => e.entityId.startsWith("sensor.") && e.attributes?.device_class === "temperature");
  const badges = [];
  if (mediaOn) badges.push(`\u{1F4FA} ${escape(mediaOn.label || t("Player"))}`);
  if (lightsOn) badges.push(`\u{1F4A1} ${lightsOn}`);
  if (temp) badges.push(`\u{1F321}\uFE0F ${temp.state}\u00a0${temp.attributes?.unit_of_measurement ?? ""}`);

  head.innerHTML = `
    <span class="room-name">${escape(area.name)}</span>
    <span class="room-badges">${badges.join(" \u2022 ")}</span>`;
  card.appendChild(head);

  const grid = document.createElement("div");
  grid.className = "room-grid";
  for (const e of visibleTiles.slice(0, 6)) {
    const type = tileTypeFor(e.entityId);
    let onToggle;
    if (type === "light") {
      onToggle = () => openLightModal({
        entity: e,
        areaName: area.name,
        store,
        commands,
        eventBus,
      });
    } else if (type === "media") {
      onToggle = () => openMediaModal({
        entity: e,
        areaName: area.name,
        store,
        commands,
        eventBus,
      });
    } else if (togglable(type)) {
      onToggle = () => callToggle(e, commands, eventBus);
    }
    new Tile({ entity: e, type, onToggle }).mount(grid);
  }
  card.appendChild(grid);
  return card;
}

function tileTypeFor(entityId) {
  const dom = entityId.split(".")[0];
  if (dom === "light")        return "light";
  if (dom === "switch")       return "switch";
  if (dom === "lock")         return "lock";
  if (dom === "media_player") return "media";
  if (dom === "climate")      return "sensor"; // bruger samme read-only visning
  return "generic";
}
function togglable(type) {
  return type === "light" || type === "switch" || type === "lock";
}
async function callToggle(entity, commands, eventBus) {
  try {
    const domain = entity.entityId.split(".")[0];
    await commands.callService(domain, "toggle", {}, { entity_id: entity.entityId });
  } catch (e) {
    eventBus.emit("toast:show", { message: e.message || t("Action failed"), tone: "error" });
  }
}

// =====================================================================
// Misc
// =====================================================================

function escape(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
