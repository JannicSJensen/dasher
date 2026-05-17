/**
 * Small pure formatting helpers.
 */

/** Format a number with an optional unit; returns "—" if value is unknown. */
export function fmtNumber(value, { unit = "", digits = 1 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const text = digits === 0 ? Math.round(n).toString() : n.toFixed(digits);
  return unit ? `${text} ${unit}` : text;
}

/** Format a percent (0..1 or 0..100). */
export function fmtPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const pct = n <= 1 ? n * 100 : n;
  return `${Math.round(pct)}%`;
}

/** Capitalize first letter, leave rest. */
export function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "binary_sensor.front_door" -> "front door" */
export function friendlyId(entityId = "") {
  return entityId.split(".").slice(1).join(".").replace(/_/g, " ");
}

/** Format ISO timestamp as "HH:MM". */
export function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
