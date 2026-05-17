import { BaseComponent } from "../base/BaseComponent.js";
import { Badge } from "../ui/Badge.js";
import { Icon } from "../ui/Icon.js";
import { Button } from "../ui/Button.js";
import { fmtPercent, fmtNumber } from "../../utils/format.js";
import { t as tr } from "../../core/i18n.js";

/**
 * Composite car card. Expects `data` aggregated by the BilPage:
 *   { name, battery, range, charging, locked, location, plugged, commands? }
 * Renders nothing fancy on its own — the page is responsible for picking
 * the relevant entities; this just lays them out beautifully.
 */
export class CarCard extends BaseComponent {
  render() {
    const { data } = this.props;
    const card = document.createElement("article");
    card.className = "card card--car";

    const head = document.createElement("header");
    head.className = "card__header";
    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "0.6rem";
    left.appendChild(Icon.render("car", { size: 22 }));
    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = data?.name || tr("Car");
    left.appendChild(title);
    head.appendChild(left);

    if (data?.charging) head.appendChild(new Badge({ text: tr("Charging"), tone: "good" }).render());
    else if (data?.plugged) head.appendChild(new Badge({ text: tr("Plugged in"), tone: "info" }).render());
    card.appendChild(head);

    const body = document.createElement("div");
    body.className = "card__body";
    body.style.display = "grid";
    body.style.gridTemplateColumns = "repeat(auto-fit, minmax(120px, 1fr))";
    body.style.gap = "var(--space-3)";

    body.appendChild(stat(tr("Battery"), fmtPercent(data?.battery)));
    body.appendChild(stat(tr("Range"), fmtNumber(data?.range, { unit: "km", digits: 0 })));
    body.appendChild(stat(tr("Lock"), data?.locked === true ? tr("Locked") : data?.locked === false ? tr("Unlocked") : "—"));
    if (data?.location) body.appendChild(stat(tr("Position"), data.location));

    card.appendChild(body);

    if (data?.commands?.length) {
      const footer = document.createElement("footer");
      footer.className = "card__footer";
      for (const cmd of data.commands) {
        footer.appendChild(new Button({
          label: cmd.label, variant: cmd.variant || "ghost", icon: cmd.icon, onClick: cmd.onClick,
        }).render());
      }
      card.appendChild(footer);
    }
    return card;
  }
}

function stat(label, value) {
  const wrap = document.createElement("div");
  const l = document.createElement("div");
  l.style.color = "var(--color-text-2)";
  l.style.fontSize = "var(--fs-xs)";
  l.style.textTransform = "uppercase";
  l.style.letterSpacing = "0.04em";
  l.textContent = label;
  const v = document.createElement("div");
  v.style.fontSize = "var(--fs-xl)";
  v.style.fontWeight = "700";
  v.style.marginTop = "var(--space-1)";
  v.textContent = value;
  wrap.append(l, v);
  return wrap;
}
