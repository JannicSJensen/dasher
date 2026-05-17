import { BaseComponent } from "../components/base/BaseComponent.js";
import { t } from "../core/i18n.js";

/**
 * Login overlay matcher screenshottet: HA-logo chip, m\u00f8rkt card p\u00e5 taupe
 * baggrund, BASE URL + "Login med Home Assistant"-pill, og diskret fallback
 * til access-token for brugere uden CORS-tilpasning.
 *
 *   new LoginPage({
 *     initial: { baseUrl, token },
 *     mode: "redirect" | "token",                   // default "redirect"
 *     onAuthorize: async ({ baseUrl }) => {},       // starter redirect-flow
 *     onSubmit: async ({ mode:"token", baseUrl, token }) => true|throw,
 *     onSuccess: () => {},
 *     error: "...",                                 // valgfri startfejl
 *   }).mount(document.body);
 */
export class LoginPage extends BaseComponent {
  constructor(props) {
    super(props);
    this._mode = props.mode === "token" ? "token" : "redirect";
  }

  render() {
    const overlay = document.createElement("div");
    overlay.className = "login-overlay";

    const card = document.createElement("div");
    card.className = "login-card";
    overlay.appendChild(card);

    // Brand chip
    const brand = document.createElement("div");
    brand.className = "login-brand";
    brand.innerHTML = HA_LOGO_SVG;
    card.appendChild(brand);

    const title = document.createElement("h1");
    title.className = "login-title";
    title.textContent = t("Connect to your Home Assistant");
    card.appendChild(title);

    const divider = document.createElement("hr");
    divider.className = "login-divider";
    card.appendChild(divider);

    this._form = document.createElement("form");
    this._form.className = "login-form";
    this._form.noValidate = true;
    card.appendChild(this._form);

    this.listen(this._form, "submit", (e) => {
      e.preventDefault();
      this._handleSubmit();
    });

    this._renderFields();
    return overlay;
  }

  onMount() {
    document.getElementById("app")?.classList.add("is-hidden");
    document.body.classList.add("login-active");
    if (this.props.error) this._setError(this.props.error);
    queueMicrotask(() => this._focusFirstEmpty());
  }

  onUnmount() {
    document.getElementById("app")?.classList.remove("is-hidden");
    document.body.classList.remove("login-active");
  }

  // ---- internals -----------------------------------------------------

  _renderFields() {
    this._form.replaceChildren();

    const urlField = field({
      label: "BASE URL",
      helper: t("Your Home Assistant URL (local or Nabu Casa)"),
      input: {
        type: "url",
        placeholder: "https://ui.nabu.casa",
        autocomplete: "url",
        value: this.props.initial?.baseUrl ?? "",
        required: true,
      },
    });
    this._urlInput = urlField.input;
    this._form.appendChild(urlField.wrap);

    if (this._mode === "token") {
      const tokenField = field({
        label: "ACCESS TOKEN",
        helper: t("Long-lived access token from your HA profile"),
        input: {
          type: "password",
          placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
          autocomplete: "off",
          value: this.props.initial?.token ?? "",
          required: true,
        },
        trailing: this._buildEyeButton(),
      });
      this._tokenInput = tokenField.input;
      this._wireEye(tokenField);
      this._form.appendChild(tokenField.wrap);
    }

    this._errorEl = document.createElement("p");
    this._errorEl.className = "login-error";
    this._errorEl.setAttribute("role", "alert");
    this._form.appendChild(this._errorEl);

    this._submitBtn = document.createElement("button");
    this._submitBtn.type = "submit";
    this._submitBtn.className = "login-submit";
    this._submitBtn.textContent = this._mode === "redirect"
      ? t("LOG IN WITH HOME ASSISTANT")
      : "CONNECT";
    this._form.appendChild(this._submitBtn);

    // Mode-switch
    const switchLink = document.createElement("button");
    switchLink.type = "button";
    switchLink.className = "login-help login-mode-toggle";
    switchLink.textContent = this._mode === "redirect"
      ? t("Use long-lived access token instead")
      : t("Use Home Assistant login instead");
    this.listen(switchLink, "click", () => {
      this._mode = this._mode === "redirect" ? "token" : "redirect";
      this._renderFields();
      queueMicrotask(() => this._focusFirstEmpty());
    });
    this._form.appendChild(switchLink);

    if (this._mode === "token") {
      const helpLink = document.createElement("a");
      helpLink.className = "login-help";
      helpLink.target = "_blank";
      helpLink.rel = "noopener noreferrer";
      helpLink.href = "https://www.home-assistant.io/docs/authentication/#your-account-profile";
      helpLink.innerHTML = `${EXTERNAL_ICON} <span>${t("How to create an access token")}</span>`;
      this._form.appendChild(helpLink);
    }
  }

  _focusFirstEmpty() {
    const inputs = [this._urlInput, this._tokenInput].filter(Boolean);
    (inputs.find((i) => !i.value) ?? inputs[0])?.focus();
  }

  _wireEye(fieldObj) {
    this.listen(fieldObj.trailingEl, "click", () => {
      const input = fieldObj.input;
      const hidden = input.type === "password";
      input.type = hidden ? "text" : "password";
      fieldObj.trailingEl.innerHTML = hidden ? EYE_OFF_ICON : EYE_ICON;
      fieldObj.trailingEl.setAttribute("aria-label", hidden ? "Hide" : "Show");
    });
  }

  _setError(msg) {
    if (this._errorEl) this._errorEl.textContent = msg || "";
  }

  async _handleSubmit() {
    this._setError("");

    const baseUrl = this._urlInput.value.trim();
    if (!isValidUrl(baseUrl)) {
      this._setError(t("Enter a valid URL including https://"));
      this._urlInput.focus();
      return;
    }

    this._submitBtn.disabled = true;
    this._submitBtn.classList.add("is-loading");

    try {
      if (this._mode === "redirect") {
        this._submitBtn.textContent = t("REDIRECTING…");
        // onAuthorize forventes at navigere browseren v\u00e6k; hvis den
        // returnerer normalt, lader vi knappen st\u00e5 i loading-state.
        await this.props.onAuthorize?.({ baseUrl });
        return;
      }

      const token = this._tokenInput.value.trim();
      if (!token) {
        this._setError(t("Access token is required."));
        this._resetSubmit();
        this._tokenInput.focus();
        return;
      }
      this._submitBtn.textContent = "CONNECTING…";
      await this.props.onSubmit?.({ mode: "token", baseUrl, token });
      this._submitBtn.classList.remove("is-loading");
      this._submitBtn.classList.add("is-success");
      this._submitBtn.textContent = "CONNECTED \u2713";
      setTimeout(() => this.props.onSuccess?.(), 600);
    } catch (err) {
      this._setError(err?.message || t("Login failed."));
      this._resetSubmit();
    }
  }

  _resetSubmit() {
    this._submitBtn.disabled = false;
    this._submitBtn.classList.remove("is-loading");
    this._submitBtn.textContent = this._mode === "redirect"
      ? t("LOG IN WITH HOME ASSISTANT")
      : "CONNECT";
  }

  _buildEyeButton() {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "login-eye";
    b.setAttribute("aria-label", "Show");
    b.innerHTML = EYE_ICON;
    return b;
  }
}

// =====================================================================
// DOM helpers
// =====================================================================

function field({ label, helper, input: attrs, trailing }) {
  const wrap = document.createElement("div");
  wrap.className = "login-field";

  const lbl = document.createElement("label");
  lbl.className = "login-field__label";
  lbl.textContent = label;
  wrap.appendChild(lbl);

  const inputWrap = document.createElement("div");
  inputWrap.className = "login-field__input";

  const input = document.createElement("input");
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "value") input.value = v ?? "";
    else if (v === true) input.setAttribute(k, "");
    else if (v != null && v !== false) input.setAttribute(k, String(v));
  }
  const id = `login-input-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  lbl.setAttribute("for", id);
  inputWrap.appendChild(input);

  let trailingEl = null;
  if (trailing) {
    trailingEl = trailing;
    inputWrap.appendChild(trailing);
    inputWrap.classList.add("has-trailing");
  }
  wrap.appendChild(inputWrap);

  if (helper) {
    const h = document.createElement("p");
    h.className = "login-field__helper";
    h.textContent = helper;
    wrap.appendChild(h);
  }
  return { wrap, input, trailingEl };
}

function isValidUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

// =====================================================================
// SVG
// =====================================================================

const HA_LOGO_SVG = `
<svg viewBox="0 0 32 32" width="40" height="40" aria-hidden="true">
  <path fill="#1d1d1d" d="M16 3.2 4 13.6V28a1.6 1.6 0 0 0 1.6 1.6h6.4v-8h8v8h6.4A1.6 1.6 0 0 0 28 28V13.6L16 3.2zm-1.2 12.4a1.6 1.6 0 1 1 2.4 0l3.2 3.2-1.2 1.2-3.2-3.2-3.2 3.2-1.2-1.2 3.2-3.2z"/>
</svg>`;

const EYE_ICON = `
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

const EYE_OFF_ICON = `
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M17.94 17.94A10.1 10.1 0 0 1 12 19c-6 0-10-7-10-7a18.6 18.6 0 0 1 4.06-4.94"/>
  <path d="M9.9 4.24A10 10 0 0 1 12 4c6 0 10 7 10 7a18.6 18.6 0 0 1-2.16 3.19"/>
  <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
  <path d="M3 3l18 18"/>
</svg>`;

const EXTERNAL_ICON = `
<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 3h7v7"/>
  <path d="M10 14L21 3"/>
  <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>
</svg>`;
