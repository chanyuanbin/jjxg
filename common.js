const TOKENS = {
  userAccess: "strategy_user_access_token",
  userRefresh: "strategy_user_refresh_token",
  adminAccess: "strategy_admin_access_token",
  adminRefresh: "strategy_admin_refresh_token",
};

const USER_LOGIN_NOTICE_KEY = "strategy_user_login_notice";

function setStatusBar(id, text, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status-bar${type ? ` status-${type}` : ""}`;
}

function loadToken(key) {
  return window.localStorage.getItem(key) || "";
}

function saveTokenPair(accessKey, refreshKey, payload) {
  window.localStorage.setItem(accessKey, payload.access_token);
  window.localStorage.setItem(refreshKey, payload.refresh_token);
}

function clearTokenPair(accessKey, refreshKey) {
  window.localStorage.removeItem(accessKey);
  window.localStorage.removeItem(refreshKey);
}

function setUserLoginNotice(text) {
  const value = String(text || "").trim();
  if (!value) {
    window.sessionStorage.removeItem(USER_LOGIN_NOTICE_KEY);
    return;
  }
  window.sessionStorage.setItem(USER_LOGIN_NOTICE_KEY, value);
}

function consumeUserLoginNotice() {
  const text = window.sessionStorage.getItem(USER_LOGIN_NOTICE_KEY) || "";
  if (text) {
    window.sessionStorage.removeItem(USER_LOGIN_NOTICE_KEY);
  }
  return text;
}

function redirectToUserLogin(message = "") {
  clearTokenPair(TOKENS.userAccess, TOKENS.userRefresh);
  setUserLoginNotice(message);
  window.location.href = "/web/login.html";
}

function formatErrorDetail(detail) {
  if (detail === null || detail === undefined || detail === "") {
    return "";
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => formatErrorDetail(item)).filter(Boolean).join("；");
  }
  if (typeof detail === "object") {
    const message = detail.msg || detail.message || detail.detail;
    if (message) {
      const location = Array.isArray(detail.loc) ? detail.loc.join(".") : "";
      return location ? `${location}: ${message}` : String(message);
    }
    return JSON.stringify(detail);
  }
  return String(detail);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  let payload = null;
  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }
  if (!response.ok) {
    const detail = payload && typeof payload === "object" ? formatErrorDetail(payload.detail || payload) : String(payload);
    const error = new Error(detail || `请求失败: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function authorizedRequest(url, token, options = {}) {
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
  return requestJson(url, { ...options, headers });
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "string" && value.includes("T")) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
      return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
    }
  }
  return String(value);
}
