/**
 * Leveled logger. Defaults to "warn" — flip via `logger.setLevel("debug")`
 * or persisted in storage by the Settings page.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

class Logger {
  constructor(level = "warn") {
    this._level = LEVELS[level] ?? LEVELS.warn;
  }

  setLevel(level) {
    if (LEVELS[level] != null) this._level = LEVELS[level];
  }

  getLevel() {
    return Object.entries(LEVELS).find(([, v]) => v === this._level)?.[0] ?? "warn";
  }

  _log(method, levelName, args) {
    if (this._level > LEVELS[levelName]) return;
    const time = new Date().toISOString().split("T")[1].replace("Z", "");
    // eslint-disable-next-line no-console
    console[method](`%c[${time}] %c${levelName.toUpperCase()}`, "color:#94a3b8", `color:${levelColor(levelName)}`, ...args);
  }

  debug(...args) { this._log("debug", "debug", args); }
  info(...args)  { this._log("info",  "info",  args); }
  warn(...args)  { this._log("warn",  "warn",  args); }
  error(...args) { this._log("error", "error", args); }
}

function levelColor(level) {
  switch (level) {
    case "debug": return "#60a5fa";
    case "info":  return "#34d399";
    case "warn":  return "#fbbf24";
    case "error": return "#f87171";
    default:      return "#cbd5e1";
  }
}

export const logger = new Logger();
