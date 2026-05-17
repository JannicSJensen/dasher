/**
 * Home Assistant OAuth2 redirect-flow.
 *
 * Brugeren sendes til HA's egen login-side (virker med Nabu Casa, MFA, SSO).
 * HA redirecter tilbage med ?code=… og vi bytter koden til et access_token
 * + refresh_token via /auth/token.
 *
 *   beginAuthorize()           — redirecter browseren til /auth/authorize
 *   handleRedirectCallback()   — kaldes ved boot; finder ?code i URL'en og
 *                                udveksler den. Returnerer { baseUrl, tokens }
 *                                eller null hvis der ikke er noget callback.
 *   refresh(refreshToken)      — forny access_token
 *   revoke(refreshToken)       — best-effort revoke ved logout
 *
 * Token-endpointet /auth/token tillader cross-origin POST n\u00e5r client_id
 * matcher Origin-headeren, s\u00e5 vi beh\u00f8ver ikke at \u00e6ndre
 * `http.cors_allowed_origins` i HA's configuration.yaml.
 */

const SS_STATE_KEY  = "dasher.auth.state";
const SS_BASEURL_KEY = "dasher.auth.baseUrl";

import { t } from "../core/i18n.js";

export class HAAuth {
  /** @param {{ baseUrl?: string, clientId?: string, redirectUri?: string }} opts */
  constructor({ baseUrl = "", clientId, redirectUri } = {}) {
    this.baseUrl     = normalizeBaseUrl(baseUrl);
    // HA's konvention: client_id og redirect_uri er begge URL'er til vores app.
    // redirect_uri SKAL starte med client_id, ellers afviser HA flowet.
    this.clientId    = clientId    || defaultClientId();
    this.redirectUri = redirectUri || this.clientId;
  }

  setBaseUrl(url) { this.baseUrl = normalizeBaseUrl(url); }

  // ---- public API --------------------------------------------------------

  /**
   * Send brugeren til HA's login. Returnerer ikke (browser navigerer v\u00e6k).
   */
  beginAuthorize() {
    if (!this.baseUrl) throw new Error(t("Missing Home Assistant URL."));
    const state = randomState();
    sessionStorage.setItem(SS_STATE_KEY, state);
    sessionStorage.setItem(SS_BASEURL_KEY, this.baseUrl);

    const url = new URL(`${this.baseUrl}/auth/authorize`);
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set("redirect_uri", this.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");

    window.location.assign(url.toString());
  }

  /**
   * Hvis URL'en indeholder ?code=... fra et HA-redirect, byt koden til
   * tokens. Returnerer { baseUrl, tokens } eller null.
   *
   * Rydder altid ?code/?state ud af URL'en s\u00e5 et reload ikke pr\u00f8ver igen.
   */
  async handleRedirectCallback() {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get("code");
    const state = params.get("state");
    const err   = params.get("error");

    if (!code && !err) return null;

    // Ryd query string (bevar hash) f\u00f8r vi g\u00f8r noget der kan kaste.
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState(null, "", cleanUrl);

    if (err) {
      sessionStorage.removeItem(SS_STATE_KEY);
      throw new Error(humanize(err));
    }

    const expectedState = sessionStorage.getItem(SS_STATE_KEY);
    const baseUrl       = sessionStorage.getItem(SS_BASEURL_KEY) || this.baseUrl;
    sessionStorage.removeItem(SS_STATE_KEY);
    sessionStorage.removeItem(SS_BASEURL_KEY);

    if (!expectedState || expectedState !== state) {
      throw new Error(t("Login rejected (state mismatch). Please try again."));
    }
    if (!baseUrl) throw new Error(t("Missing Home Assistant URL from login."));

    this.setBaseUrl(baseUrl);
    const tokens = await this._exchangeCode(code);
    return { baseUrl, tokens };
  }

  /** Returnerer true hvis URL'en lige nu har et HA auth callback. */
  static hasPendingCallback() {
    const p = new URLSearchParams(window.location.search);
    return p.has("code") || p.has("error");
  }

  /** Forny access_token ud fra et refresh_token. */
  async refresh(refreshToken) {
    const data = await this._form("/auth/token", {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.clientId,
    });
    return {
      access_token : data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      expires_in   : data.expires_in,
      expires_at   : Date.now() + (data.expires_in ?? 1800) * 1000,
    };
  }

  /** Best-effort revoke; fejl ignoreres af kalderen. */
  async revoke(refreshToken) {
    await this._form("/auth/token", {
      action: "revoke",
      token: refreshToken,
    }).catch(() => null);
  }

  // ---- internals ---------------------------------------------------------

  async _exchangeCode(code) {
    const data = await this._form("/auth/token", {
      grant_type: "authorization_code",
      code,
      client_id: this.clientId,
    });
    if (!data?.access_token) throw new Error(t("Token exchange failed."));
    return {
      access_token : data.access_token,
      refresh_token: data.refresh_token,
      expires_in   : data.expires_in,
      expires_at   : Date.now() + (data.expires_in ?? 1800) * 1000,
    };
  }

  async _form(path, body) {
    const url = `${this.baseUrl}${path}`;
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(body).toString(),
      });
    } catch {
      throw new Error(
        "Kan ikke n\u00e5 Home Assistant. Tjek URL og at instansen er n\u00e5elig fra denne enhed."
      );
    }
    let data = null;
    try { data = await res.json(); } catch { /* tom */ }
    if (!res.ok) {
      const msg = data?.error_description || data?.error || `HTTP ${res.status}`;
      throw new Error(humanize(msg));
    }
    return data;
  }
}

// ---- helpers -------------------------------------------------------------

function normalizeBaseUrl(u) {
  if (!u) return "";
  return String(u).trim().replace(/\/+$/, "");
}

function defaultClientId() {
  if (typeof window === "undefined") return "https://dasher.local/";
  // HA kr\u00e6ver at client_id slutter med /
  return `${window.location.origin}/`;
}

function randomState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

const ERROR_MAP = {
  access_denied   : "Login blev annulleret.",
  invalid_request : "Forkert anmodning til Home Assistant.",
  invalid_grant   : "Login-koden er ugyldig eller udl\u00f8bet.",
  invalid_client  : "Klient-id godkendes ikke af Home Assistant.",
  unauthorized_client: "Klienten har ikke lov til at logge ind.",
};

function humanize(msg) {
  if (typeof msg !== "string") return "Login fejlede.";
  return ERROR_MAP[msg] || msg;
}
