import { apiBase } from "./client";

export type HealthInfo = { ok: boolean; auth_required: boolean; allow_registrations: boolean };

export const healthApi = {
  get: async (): Promise<HealthInfo | null> => {
    try {
      const res = await fetch(`${apiBase()}/health`, { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        ok: Boolean(data?.ok),
        auth_required: Boolean(data?.auth_required),
        allow_registrations: data?.allow_registrations !== false,
      };
    } catch {
      return null;
    }
  },
};
