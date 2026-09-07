import type { AuthUser } from "../api/auth";

const TOKEN_KEY = "printstash_auth_token";
const USER_KEY = "printstash_auth_user";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;
  return storage.getItem(TOKEN_KEY);
}

export function storeToken(token: string) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(TOKEN_KEY);
}

// The API has no /me endpoint, so the display name/email/role shown in the UserMenu is
// persisted alongside the token from whatever /login or /register last returned, rather than
// refetched on every page load.
export function readUser(): AuthUser | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function storeUser(user: AuthUser) {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser() {
  const storage = getStorage();
  if (!storage) return;
  storage.removeItem(USER_KEY);
}

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init || {});
  const token = readToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export function appendTokenToUrl(url: string): string {
  const token = readToken();
  if (!token) return url;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    parsed.searchParams.set("token", token);
    return parsed.toString();
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}token=${encodeURIComponent(token)}`;
  }
}
