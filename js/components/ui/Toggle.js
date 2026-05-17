import { BaseComponent } from "../base/BaseComponent.js";

/**
 * Accessible toggle (role="switch").
 *
 *   new Toggle({
 *     checked: true,
 *     label: "Party mode",
 *     onChange: (next) => {},
 *     disabled: false,
 *   }).render();
 */
export class Toggle extends BaseComponent {
  render() {
    const { checked = false, label, onChange, disabled = false, ariaLabel } = this.props;

    const wrap = document.createElement("div");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "0.5rem";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", checked ? "true" : "false");
    if (ariaLabel || label) toggle.setAttribute("aria-label", ariaLabel || label);
    if (disabled) toggle.disabled = true;

    const knob = document.createElement("span");
    knob.className = "toggle__knob";
    toggle.appendChild(knob);
    wrap.appendChild(toggle);

    if (label) {
      const lbl = document.createElement("span");
      lbl.textContent = label;
      lbl.style.color = "var(--color-text-1)";
      wrap.appendChild(lbl);
    }

    this.listen(toggle, "click", () => {
      if (disabled) return;
      const next = toggle.getAttribute("aria-checked") !== "true";
      toggle.setAttribute("aria-checked", next ? "true" : "false");
      onChange?.(next);
    });

    return wrap;
  }
}
