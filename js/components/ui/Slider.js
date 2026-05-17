import { BaseComponent } from "../base/BaseComponent.js";

/**
 * Range slider with live label.
 *
 *   new Slider({
 *     label: "Brightness",
 *     unit: "%",
 *     min: 0, max: 100, step: 1,
 *     value: 50,
 *     onInput: (v) => {},   // throttled by caller if needed
 *     onChange: (v) => {},  // commit (mouseup / keyup)
 *   }).render();
 */
export class Slider extends BaseComponent {
  render() {
    const {
      label = "",
      unit = "",
      min = 0,
      max = 100,
      step = 1,
      value = 0,
      onInput,
      onChange,
    } = this.props;

    const wrap = document.createElement("div");
    wrap.className = "slider";

    const labelRow = document.createElement("div");
    labelRow.className = "slider__label";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.textContent = `${value}${unit}`;
    labelRow.append(labelEl, valueEl);
    wrap.appendChild(labelRow);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    wrap.appendChild(input);

    this.listen(input, "input", (e) => {
      const v = Number(e.target.value);
      valueEl.textContent = `${v}${unit}`;
      onInput?.(v);
    });

    if (onChange) {
      this.listen(input, "change", (e) => onChange(Number(e.target.value)));
    }

    return wrap;
  }
}
