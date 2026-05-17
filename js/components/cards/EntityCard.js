import { BaseComponent } from "../base/BaseComponent.js";
import { Badge } from "../ui/Badge.js";

/**
 * Generic entity row — friendly name on the left, state badge on the right.
 * Fallback renderer for any entity that doesn't have a specialized card.
 */
export class EntityCard extends BaseComponent {
  render() {
    const { entity, onClick } = this.props;
    if (!entity) return placeholder();

    const row = document.createElement("div");
    row.className = "entity-row";
    if (onClick) row.style.cursor = "pointer";

    const left = document.createElement("div");
    left.className = "entity-row__main";
    const name = document.createElement("div");
    name.className = "entity-row__name";
    name.textContent = entity.label;
    const meta = document.createElement("div");
    meta.className = "entity-row__meta";
    meta.textContent = entity.entityId;
    left.append(name, meta);
    row.appendChild(left);

    row.appendChild(new Badge({ text: String(entity.state ?? "—"), tone: toneFor(entity.state) }).render());

    if (onClick) this.listen(row, "click", () => onClick(entity));
    return row;
  }
}

function toneFor(state) {
  if (state === "on" || state === "home" || state === "unlocked" || state === "open") return "good";
  if (state === "off" || state === "not_home" || state === "closed" || state === "locked") return "info";
  if (state === "unavailable" || state === "unknown") return "warn";
  return undefined;
}

function placeholder() {
  const d = document.createElement("div");
  d.className = "entity-row";
  d.textContent = "—";
  return d;
}
