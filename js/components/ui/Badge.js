import { BaseComponent } from "../base/BaseComponent.js";

/**
 * Small status pill.
 *
 *   new Badge({ text: "On", tone: "good" | "bad" | "warn" | "info" }).render();
 */
export class Badge extends BaseComponent {
  render() {
    const { text = "", tone } = this.props;
    const span = document.createElement("span");
    span.className = "badge";
    if (tone) span.dataset.tone = tone;
    span.textContent = text;
    return span;
  }
}
