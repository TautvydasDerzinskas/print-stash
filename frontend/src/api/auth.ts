import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

export const authApi = {
  login: async (username: string, password: string): Promise<{ token: string; expires_in: number }> => {
    const res = await fetch(`${apiBase()}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      let message = "Login failed";
      try {
        const data = await res.json();
        if (typeof data?.detail === "string") message = data.detail;
      } catch {
        // ignore
      }
      throw new Error(message);
    }
    return res.json();
  },

  refresh: async (): Promise<{ token: string; expires_in: number }> => {
    const res = await fetch(`${apiBase()}/refresh`, {
      method: "POST",
      headers: authHeaders(),
    });
    assertOk(res, "Token refresh failed");
    return res.json();
  },
};
