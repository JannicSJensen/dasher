import { BaseComponent } from "../base/BaseComponent.js";
import { Icon } from "../ui/Icon.js";
import { fmtNumber } from "../../utils/format.js";

/**
 * Sensor card — big value + unit + label. Picks an icon based on
 * device_class.
 */
const ICON_FOR_CLASS = {
  temperature: "thermometer",
  humidity: "thermometer",
  illuminance: "sun",
  motion: "bolt",
  door: "door",
  window: "door",
};

export class SensorCard extends BaseComponent {
  render() {
    const { entity } = this.props;
    const cls = entity.attributes?.device_class;
    const unit = entity.attributes?.unit_of_measurement ?? "";

    const card = document.createElement("article");
    card.className = "card card--sensor";

    const head = document.createElement("div");
    head.style.display = "flex";
    head.style.alignItems = "center";
    head.style.gap = "0.5rem";
    head.style.color = "var(--color-text-2)";
    head.appendChild(Icon.render(ICON_FOR_CLASS[cls] || "bolt", { size: 18 }));
    const label = document.createElement("span");
    label.textContent = entity.label;
    head.appendChild(label);
    card.appendChild(head);

    const value = document.createElement("div");
    value.style.fontSize = "var(--fs-3xl)";
    value.style.fontWeight = "700";
    value.style.marginTop = "var(--space-2)";
    const numeric = Number(entity.state);
    value.textContent = Number.isFinite(numeric)
      ? fmtNumber(numeric, { unit, digits: unit === "%" ? 0 : 1 })
      : (entity.state ?? "—");
    card.appendChild(value);

    return card;
  }
}
