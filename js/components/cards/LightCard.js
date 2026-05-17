import { BaseComponent } from "../base/BaseComponent.js";
import { Toggle } from "../ui/Toggle.js";
import { Slider } from "../ui/Slider.js";
import { Icon } from "../ui/Icon.js";
import { throttle } from "../../utils/throttle.js";

/**
 * Light card with on/off toggle and (optional) brightness slider.
 *
 *   new LightCard({ entity, commands }).mount(parent);
 */
export class LightCard extends BaseComponent {
  render() {
    const { entity, commands } = this.props;

    const card = document.createElement("article");
    card.className = "card card--light";

    const header = document.createElement("header");
    header.className = "card__header";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "0.6rem";
    left.appendChild(Icon.render("bulb", { size: 22 }));
    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = entity.label;
    left.appendChild(title);
    header.appendChild(left);

    const isOn = entity.state === "on";

    const toggle = new Toggle({
      checked: isOn,
      ariaLabel: `${entity.label} on/off`,
      onChange: (next) => {
        if (next) commands.lightTurnOn(entity.entityId);
        else commands.lightTurnOff(entity.entityId);
      },
    });
    header.appendChild(toggle.render());
    card.appendChild(header);

    // Brightness slider only when on (and entity supports brightness).
    const brightness = entity.attributes?.brightness; // 0..255
    if (isOn && Number.isFinite(brightness)) {
      const pct = Math.round((brightness / 255) * 100);
      const onCommit = throttle((v) => commands.lightSetBrightnessPct(entity.entityId, v), 200);
      const slider = new Slider({
        label: "Lysstyrke",
        unit: "%",
        value: pct,
        onInput: onCommit,
      });
      const body = document.createElement("div");
      body.className = "card__body";
      body.appendChild(slider.render());
      card.appendChild(body);
    }

    return card;
  }
}
