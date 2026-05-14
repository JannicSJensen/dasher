const BASE_URL_KEY = "dasher.baseUrl";
const TOKEN_KEY = "dasher.token";

function hasStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadSettings() {
  if (!hasStorage()) {
    return { baseUrl: "", token: "" };
  }

  return {
    baseUrl: window.localStorage.getItem(BASE_URL_KEY) ?? "",
    token: window.localStorage.getItem(TOKEN_KEY) ?? "",
  };
}

export function saveSettings({ baseUrl, token }) {
  if (!hasStorage()) {
    return;
  }

  window.localStorage.setItem(BASE_URL_KEY, baseUrl.trim());
  window.localStorage.setItem(TOKEN_KEY, token.trim());
}
