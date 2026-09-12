// Service worker: owns the extension's config/auth state and every fetch() call to the user's
// Thingport instance. Content scripts and the popup never fetch() directly -- they send a
// message here and get a plain JSON result back -- so auth (login + silent re-login on
// expiry/401) and the instance URL live in exactly one place. `host_permissions` for the saved
// instance origin (requested at setup time, see handleSaveConfig) is what lets this fetch() the
// user's self-hosted instance free of that instance's own CORS config.
importScripts("common.js");

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function getStoredConfig() {
  const keys = Object.values(THINGPORT_STORAGE_KEYS);
  return chrome.storage.local.get(keys);
}

function isConfigured(config) {
  return Boolean(config.instanceUrl && config.email && config.password);
}

/** (Re-)authenticates against the stored instance/credentials and persists the resulting token.
 *  Called by ensureToken on first use / near expiry, and again once on a 401 (a password change
 *  or server-side session revocation shouldn't require reopening the popup to recover from). */
async function loginAndStoreToken(config) {
  const res = await fetch(thingportApiUrl(config.instanceUrl, "/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.email, password: config.password }),
  });
  if (!res.ok) {
    let message = "Could not sign in to this Thingport instance";
    try {
      const body = await res.json();
      if (body && body.detail) message = body.detail;
    } catch {
      // ignore -- keep the generic message
    }
    throw new Error(message);
  }
  const data = await res.json();
  const tokenExpiresAt = Date.now() + data.expires_in * 1000;
  await chrome.storage.local.set({ token: data.token, tokenExpiresAt });
  return data.token;
}

async function ensureToken(config, { forceRefresh = false } = {}) {
  if (!forceRefresh && config.token && config.tokenExpiresAt && config.tokenExpiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
    return config.token;
  }
  return loginAndStoreToken(config);
}

/** Generic authenticated call to the stored instance -- every content-script/popup action goes
 *  through this rather than a bespoke RPC per endpoint, since the backend surface this extension
 *  needs (see the plan this was built from) is otherwise a straight passthrough. `path` is the
 *  API path after `/api` (e.g. "/collections", "/import/jobs/abc123"). */
async function apiCall(method, path, body) {
  const config = await getStoredConfig();
  if (!isConfigured(config)) throw new Error("Thingport Grab isn't configured yet -- open the extension popup first.");
  if (config.disabled) throw new Error("Thingport Grab is disabled -- re-enable it from the extension popup.");

  const doFetch = async (token) =>
    fetch(thingportApiUrl(config.instanceUrl, path), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  let token = await ensureToken(config);
  let res = await doFetch(token);
  if (res.status === 401) {
    token = await ensureToken(config, { forceRefresh: true });
    res = await doFetch(token);
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errBody = await res.json();
      if (errBody && errBody.detail) message = errBody.detail;
    } catch {
      // ignore -- keep the generic message
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Reflects configured+enabled state on the toolbar icon (color = active, dark = not) -- see
 *  manifest.json's `action.default_icon` for the inactive default this overrides. */
async function updateActionIcon() {
  const config = await getStoredConfig();
  const active = isConfigured(config) && !config.disabled;
  const prefix = active ? "thingport-icon-color" : "thingport-icon-dark";
  await chrome.action.setIcon({
    path: {
      16: `icons/${prefix}-16.png`,
      32: `icons/${prefix}-32.png`,
      48: `icons/${prefix}-48.png`,
      128: `icons/${prefix}-128.png`,
    },
  });
}

// The host permission for the chosen instance origin is requested by popup.js itself, not here --
// chrome.permissions.request() must run within the user gesture that triggered it (the popup's
// own submit click), which doesn't survive a chrome.runtime.sendMessage hop into this service
// worker. By the time SAVE_CONFIG arrives, popup.js has already been granted (or refused, in
// which case it never sends this) that permission.
async function handleSaveConfig({ instanceUrl, email, password }) {
  const normalized = thingportNormalizeInstanceUrl(instanceUrl);
  // Validate before persisting -- a typo'd URL or wrong password shouldn't silently save.
  await loginAndStoreToken({ instanceUrl: normalized, email, password });
  await chrome.storage.local.set({ instanceUrl: normalized, email, password, disabled: false });
  await updateActionIcon();
}

async function handleSetDisabled(disabled) {
  await chrome.storage.local.set({ disabled: Boolean(disabled) });
  await updateActionIcon();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case "GET_STATE": {
          const config = await getStoredConfig();
          sendResponse({
            ok: true,
            data: { configured: isConfigured(config), disabled: Boolean(config.disabled), instanceUrl: config.instanceUrl || "" },
          });
          return;
        }
        case "SAVE_CONFIG":
          await handleSaveConfig(message.payload);
          sendResponse({ ok: true });
          return;
        case "SET_DISABLED":
          await handleSetDisabled(message.payload.disabled);
          sendResponse({ ok: true });
          return;
        case "API_CALL": {
          const data = await apiCall(message.payload.method, message.payload.path, message.payload.body);
          sendResponse({ ok: true, data });
          return;
        }
        default:
          sendResponse({ ok: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true; // keep the message channel open for the async response above
});

chrome.runtime.onInstalled.addListener(() => { void updateActionIcon(); });
chrome.runtime.onStartup.addListener(() => { void updateActionIcon(); });
