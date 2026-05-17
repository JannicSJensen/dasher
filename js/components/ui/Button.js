import { BaseComponent } from "../base/BaseComponent.js";
import { Icon } from "./Icon.js";

/**
 * Button primitive.
 *
 *   new Button({
 *     label: "Save",
 *     variant: "primary" | "ghost" | "danger" | "icon",
 *     icon: "refresh",      // optional Icon name
 *     iconOnly: false,      // hide label, render as icon button
 *     disabled: false,
 *     onClick: () => {},
 *     type: "button",
 *   }).render();
 */
export class Button extends BaseComponent {
  render() {
    const {
      label = "",
      variant = "primary",
      icon,
      iconOnly = false,
      disabled = false,
      onClick,
      type = "button",
      ariaLabel,
    } = this.props;

    const btn = document.createElement("button");
    btn.type = type;
    btn.className = `btn btn--${variant}${iconOnly ? " btn--icon" : ""}`;
    if (disabled) btn.disabled = true;
    if (ariaLabel || (iconOnly && label)) btn.setAttribute("aria-label", ariaLabel || label);

    if (icon && Icon.has(icon)) btn.appendChild(Icon.render(icon, { size: 18 }));
    if (label && !iconOnly) {
      const span = document.createElement("span");
      span.className = "btn__label";
      span.textContent = label;
      btn.appendChild(span);
    }

    if (onClick) this.listen(btn, "click", onClick);
    return btn;
  }
}
