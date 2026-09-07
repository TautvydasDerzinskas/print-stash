import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

export type AuthUser = { id: string; email: string; display_name: string; role: "ADMIN" | "MEMBER" };
export type AuthResult = { token: string; expires_in: number; user: AuthUser };

async function postAuth(path: string, body: unknown): Promise<AuthResult> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") message = data.detail;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json();
}

export const authApi = {
  login: (email: string, password: string): Promise<AuthResult> => postAuth("/login", { email, password }),

  register: (payload: { displayName: string; email: string; password: string }): Promise<AuthResult> =>
    postAuth("/register", { displayName: payload.displayName, email: payload.email, password: payload.password }),

  refresh: async (): Promise<{ token: string; expires_in: number }> => {
    const res = await fetch(`${apiBase()}/refresh`, {
      method: "POST",
      headers: authHeaders(),
    });
    assertOk(res, "Token refresh failed");
    return res.json();
  },
};
