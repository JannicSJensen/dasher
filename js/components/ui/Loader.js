import { BaseComponent } from "../base/BaseComponent.js";

/**
 * Loader / skeleton primitives.
 *
 *   new Loader({ kind: "spinner" }).render();
 *   new Loader({ kind: "skeleton", lines: 3 }).render();
 */
export class Loader extends BaseComponent {
  render() {
    const { kind = "spinner", lines = 3, label } = this.props;

    if (kind === "spinner") {
      const wrap = document.createElement("div");
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "0.5rem";
      wrap.style.color = "var(--color-text-2)";
      const sp = document.createElement("span");
      sp.className = "spinner";
      wrap.appendChild(sp);
      if (label) {
        const lbl = document.createElement("span");
        lbl.textContent = label;
        wrap.appendChild(lbl);
      }
      return wrap;
    }

    // skeleton
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "0.5rem";
    for (let i = 0; i < lines; i++) {
      const row = document.createElement("span");
      row.className = "skeleton";
      row.style.width = i === lines - 1 ? "60%" : "100%";
      wrap.appendChild(row);
    }
    return wrap;
  }
}
