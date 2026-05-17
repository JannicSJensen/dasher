/**
 * Tiny i18n helper.
 *
 * Source of truth in code is **English**. `t("English string")` returns the
 * Danish translation when the user selected `da`, otherwise it returns the
 * English string unchanged.
 *
 * Language is persisted in localStorage. Changing it via `setLanguage()`
 * reloads the page so all components pick up the new strings without us
 * having to make every component reactive to language changes.
 *
 *   import { t, getLanguage, setLanguage, LANGUAGES } from "../core/i18n.js";
 *
 *   const heading = t("Settings");
 *   setLanguage("da"); // triggers reload
 */

import { storage, STORAGE_KEYS } from "./storage.js";

export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "da", label: "Dansk"   },
];

const DEFAULT_LANG = "en";

/** English -> Danish. */
const DA = {
  // Generic
  "Home":            "Hjem",
  "Overview":        "Oversigt",
  "Music":           "Musik",
  "Car":             "Bil",
  "Party":           "Fest",
  "Settings":        "Indstillinger",
  "Settings (short)":"Indst.",
  "Waste":           "Affald",
  "Alarm":           "Alarm",
  "Calendar":        "Kalender",
  "Favorites":       "Favoritter",
  "Rooms":           "Rum",
  "Other":           "Andre",
  "Theme":           "Tema",
  "Connection":      "Forbindelse",
  "Connection and appearance": "Forbindelse og udseende",
  "A quick look at your home": "Et hurtigt blik på dit hjem",
  "Control players in your home": "Styr afspillere i hjemmet",
  "Status of your car": "Status fra din bil",
  "Set the mood":     "Tænd stemningen",

  // Buttons / actions
  "Save & connect":   "Gem & forbind",
  "Reconnect now":    "Reconnect nu",
  "Disconnect":       "Frakobl",
  "Log out":          "Log ud",
  "Save and connect": "Gem & forbind",
  "Settings saved":   "Indstillinger gemt",
  "Enter Home Assistant URL": "Indtast Home Assistant URL",
  "Switch theme":     "Skift tema",
  "Select all":       "Vælg alle",
  "Deselect all":     "Fravælg alle",
  "click to choose":  "klik for at vælge",

  // Navigation / ARIA
  "Main navigation":  "Hovednavigation",
  "Mobile navigation":"Mobilnavigation",

  // Connection states
  "Idle":             "Inaktiv",
  "Connecting":       "Forbinder",
  "Connected":        "Forbundet",
  "Reconnecting":     "Genforbinder",
  "Error":            "Fejl",
  "Offline":          "Offline",
  "Status:":          "Status:",

  // Themes
  "Dark":             "Mørk",
  "Light":            "Lys",
  "Warm":             "Warm",

  // Tile / Car
  "On":               "Tændt",
  "Off":              "Slukket",
  "Locked":           "Låst",
  "Unlocked":         "Ulåst",
  "Unknown":          "Ukendt",
  "Unavailable":      "Utilgængelig",
  "Close":            "Luk",
  "Power":            "Strøm",
  "Brightness":       "Lysstyrke",
  "Color":            "Farve",
  "Color temperature":"Farvetemperatur",
  "Effect":           "Effekt",
  "Edit":             "Rediger",
  "Done":             "Færdig",
  "Visible":          "Synlig",
  "Hidden":           "Skjult",
  "Tap entities to toggle whether they are shown. Unavailable entities are hidden by default.":
                      "Tryk på enheder for at slå visning til/fra. Utilgængelige enheder er som standard skjult.",
  "Shuffle":          "Tilfældig",
  "Previous":         "Forrige",
  "Play / Pause":     "Afspil / pause",
  "Next":             "Næste",
  "Repeat":           "Gentag",
  "Mute":             "Lyd fra",
  "Browse media":     "Gennemse medier",
  "Source":           "Kilde",
  "Media browser not available yet": "Mediebrowser endnu ikke tilgængelig",
  "No sources available": "Ingen kilder tilgængelige",
  "Charging":         "Lader",
  "Plugged in":       "Tilsluttet",
  "Battery":          "Batteri",
  "Range":            "Rækkevidde",
  "Lock":             "Lås",
  "Position":         "Position",
  "No car found":     "Ingen bil fundet",
  "Add a car integration in Home Assistant (e.g. Tesla, Polestar, VW Connect) and status will appear here automatically.":
    "Tilføj en bil-integration i Home Assistant (fx Tesla, Polestar, VW Connect), så vises status her automatisk.",
  "No scenes":        "Ingen scener",
  "Create scenes in Home Assistant to get buttons here.":
    "Opret scener i Home Assistant for at få knapper her.",

  // Oversigt
  "No known entities yet.": "Ingen kendte entiteter endnu.",
  "Calendar (next 3 days)": "Kalender (næste 3 dage)",
  "No events in the next 3 days.": "Ingen begivenheder i de næste 3 dage.",
  "All day":          "Hele dagen",
  "Today":            "I dag",
  "{n} days":         "{n} dage",
  "unknown":          "ukendt",
  "Energy today":     "Energi i dag",
  "Player":           "Afspiller",
  "Action failed":    "Handling fejlede",
  "Alarm action failed": "Alarm-handling fejlede",

  // Weather
  "Clear night":      "Klar nat",
  "Sunny":            "Solrigt",
  "Cloudy":           "Overskyet",
  "Partly cloudy":    "Delvist overskyet",
  "Hail":             "Hagl",
  "Thunder":          "Torden",
  "Thunderstorm":     "Torden med regn",
  "Rain":             "Regn",
  "Heavy rain":       "Kraftig regn",
  "Snow":             "Sne",
  "Sleet":            "Slud",
  "Fog":              "Tåge",
  "Windy":            "Blæsende",
  "Unusual weather":  "Usædvanligt vejr",

  // Waste types
  "Food and rest":    "Rest og mad",
  "Cardboard":        "Pap",
  "Plastic and paper":"Plast og papir",
  "Glass/metal":      "Glas/metal",
  "Garden waste":     "Haveaffald",
  "Hazardous waste":  "Farligt affald",

  // Alarm
  "Disarm":           "Slå fra",
  "Home (alarm)":     "Hjemme",
  "Away":             "Væk",
  "Night":            "Nat",
  "Vacation":         "Ferie",
  "Disarmed":         "Slået fra",
  "Arming…":          "Slår til…",
  "Pending…":         "Afventer…",
  "Triggered":        "Udløst",

  // Scenes (party)
  "Good night":       "Godnat",
  "Movie night":      "Film aften",
  "Evening":          "Aften",
  "Morning":          "Morgen",
  "Party mode (visual)": "Party mode (visuel)",

  // Time ago
  "just now":         "lige nu",
  "{s} sec ago":      "for {s} sek siden",
  "{m} min ago":      "for {m} min siden",
  "{h} hour ago":     "for {h} time siden",
  "{h} hours ago":    "for {h} timer siden",
  "{d} day ago":      "for {d} dag siden",
  "{d} days ago":     "for {d} dage siden",

  // Counters
  "entity":           "entitet",
  "entities":         "entiteter",
  "device":           "device",
  "devices":          "devices",
  "player":           "afspiller",
  "players":          "afspillere",
  "{n} of {total} {label}": "{n} af {total} {label}",
  "{n} of {total} {label} • click to choose": "{n} af {total} {label} • klik for at vælge",
  "{n} {label}":      "{n} {label}",
  "{n} of {total} selected": "{n} af {total} valgt",

  // Musik
  "No visible players — select under Settings.": "Ingen synlige afspillere — vælg under Indstillinger.",
  "No players match the selected filter.":       "Ingen afspillere matcher det valgte filter.",
  "Playing":          "Playing",
  "Music card layout":"Musik-kort layout",
  "Choose how media_player is shown on the Music page": "Vælg hvordan media_player vises på Musik-siden",
  "Standard":         "Standard",
  "Compact":          "Kompakt",
  "Artwork":          "Artwork",
  "Minimal":          "Minimal",
  "Sound":            "Lyd",
  "Previous":         "Forrige",
  "Pause":            "Pause",
  "Play":             "Afspil",
  "Next":             "Næste",

  // Indstillinger
  "Overview content": "Oversigtens indhold",
  "Choose which cards and entities are shown on the Overview page": "Vælg hvilke kort og entiteter der vises på Oversigt-siden",
  "Room sections on Overview.": "Rum-sektioner på Oversigt.",
  "Which waste sensors are shown in the Waste card.": "Hvilke affaldssensorer vises i Affald-kortet.",
  "Which alarm panel is shown (the first selected).": "Hvilket alarm-panel vises (det første valgte).",
  "Shortcuts / scenes / input_boolean in the Favorites card.": "Genveje / scener / input_boolean på Favoritter-kortet.",
  "Which calendars are shown in the Calendar card.": "Hvilke kalendere vises i Kalender-kortet.",
  "No candidates found yet.": "Ingen kandidater fundet endnu.",
  "No players found yet.":    "Ingen afspillere fundet endnu.",
  "Choose which player devices are shown on the Music page.": "Vælg hvilke afspiller-devices der vises på Musik-siden.",
  "Select player devices":    "Vælg afspiller-devices",
  "Devices in {name}":        "Devices i {name}",
  "Show the room on Overview": "Vis rummet på Oversigt",
  "No devices found in this room.": "Ingen devices fundet i dette rum.",
  "Debug logging in the console": "Debug logging i konsollen",
  "Debug":            "Debug",
  "About":            "Om",
  "Home Assistant URL": "Home Assistant URL",
  "Long-lived access token": "Long-lived access token",
  "Language":         "Sprog",
  "Choose interface language": "Vælg sprog for grænsefladen",
  "Sidebar labels":   "Sidebar-etiketter",
  "Rename the items in the sidebar and bottom navigation": "Omdøb punkterne i sidebar og bundnavigation",
  "Reset to default": "Nulstil til standard",
  "Default: {name}":  "Standard: {name}",

  // Login
  "Log in to Home Assistant.": "Log ind på Home Assistant.",
  "Your Home Assistant URL (local or Nabu Casa)": "Din Home Assistant URL (lokal eller Nabu Casa)",
  "Long-lived access token from your HA profile": "Long-lived access token fra din HA-profil",
  "LOG IN WITH HOME ASSISTANT": "LOG IND MED HOME ASSISTANT",
  "Use long-lived access token instead": "Brug long-lived access token i stedet",
  "Use Home Assistant login instead":    "Brug Home Assistant login i stedet",
  "How to create an access token":       "Sådan opretter du et access token",
  "Enter a valid URL including https://":"Indtast en gyldig URL inkl. https://",
  "REDIRECTING…":     "OMDIRIGERER…",
  "Login failed.":    "Login fejlede.",
  "Access token is required.": "Access token er påkrævet.",
  "Token exchange failed.": "Token-udveksling fejlede.",
  "Missing Home Assistant URL.": "Manglende Home Assistant URL.",
  "Missing Home Assistant URL from login.": "Mangler Home Assistant URL fra login.",
  "Login rejected (state mismatch). Please try again.": "Login afvist (state mismatch). Prøv igen.",
  "Could not fetch data: {msg}": "Kunne ikke hente data: {msg}",
  "Timeout — no response from Home Assistant.": "Timeout — ingen svar fra Home Assistant.",
  "Connection failed.": "Forbindelse fejlede.",
  "No refresh token.": "Intet refresh token.",
  "Reconnecting (attempt {n})...": "Reconnecting (forsøg {n})...",
  "Reconnecting in {s}s (attempt {n})": "Reconnecting in {s}s (forsøg {n})",
  "Could not open socket: {msg}": "Kunne ikke åbne socket: {msg}",
};

const DICTS = { en: null, da: DA };

let _lang = (() => {
  const raw = storage.get(STORAGE_KEYS.LANGUAGE, DEFAULT_LANG);
  return LANGUAGES.some((l) => l.id === raw) ? raw : DEFAULT_LANG;
})();

export function getLanguage() { return _lang; }

/** Persist the new language and reload so every component re-renders. */
export function setLanguage(id) {
  if (!LANGUAGES.some((l) => l.id === id)) return;
  if (id === _lang) return;
  storage.set(STORAGE_KEYS.LANGUAGE, id);
  _lang = id;
  if (typeof window !== "undefined") window.location.reload();
}

/**
 * Translate. If `vars` is provided, `{name}` placeholders in the resolved
 * string are replaced with the matching values.
 */
export function t(en, vars) {
  const dict = DICTS[_lang];
  let out = (dict && Object.prototype.hasOwnProperty.call(dict, en)) ? dict[en] : en;
  if (vars) {
    out = out.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
  }
  return out;
}
