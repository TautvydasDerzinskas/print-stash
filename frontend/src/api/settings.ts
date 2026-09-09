import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, UnauthorizedError } from "./client";

export type StorageSettings = {
  template: string;
  default_template: string;
  allowed_tokens: string[];
  plate_paths: string[];
  moved: number;
  skipped: number;
};

export type PreviewMode = "automatic" | "on-demand" | "disabled";

export type SmtpSettings = {
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  from: string;
  configured: boolean;
};

// `pass` is only ever sent, never received back (write-only, like the Thingiverse token) --
// omit it entirely to leave the stored password untouched.
export type SmtpSettingsInput = {
  host?: string | null;
  port?: number;
  secure?: boolean;
  user?: string | null;
  pass?: string | null;
  from?: string;
};

export type DatabaseInfo = {
  provider: string;
  host: string | null;
  port: number | null;
  database: string | null;
  user: string | null;
};

export const settingsApi = {
  getStorage: async (): Promise<StorageSettings> => {
    const res = await fetch(`${apiBase()}/settings/storage`, { headers: authHeaders() });
    assertOk(res, "Failed to load storage settings");
    return res.json();
  },

  updateStorage: async (payload: {
    template: string;
    apply_existing: boolean;
  }): Promise<StorageSettings> => {
    const res = await fetch(`${apiBase()}/settings/storage`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update storage settings"));
    }
    return res.json();
  },

  // Instance-wide preview generation mode -- read by every user (the model detail page needs it
  // to know whether to generate previews at all), written only from the admin settings panel.
  getPreviews: async (): Promise<{ mode: PreviewMode }> => {
    const res = await fetch(`${apiBase()}/settings/previews`, { headers: authHeaders() });
    assertOk(res, "Failed to load preview settings");
    return res.json();
  },

  updatePreviews: async (mode: PreviewMode): Promise<{ mode: PreviewMode }> => {
    const res = await fetch(`${apiBase()}/settings/previews`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ mode }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update preview settings"));
    }
    return res.json();
  },

  // Instance-wide Thingiverse Developer API Access Token, shared by every user's Thingiverse
  // imports -- write-only like any other API secret: GET only ever reports whether one is
  // configured, never the value itself.
  getThingiverse: async (): Promise<{ configured: boolean }> => {
    const res = await fetch(`${apiBase()}/settings/thingiverse`, { headers: authHeaders() });
    assertOk(res, "Failed to load Thingiverse settings");
    return res.json();
  },

  updateThingiverse: async (accessToken: string | null): Promise<{ configured: boolean }> => {
    const res = await fetch(`${apiBase()}/settings/thingiverse`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ access_token: accessToken }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update Thingiverse settings"));
    }
    return res.json();
  },

  // SMTP is used to send the account-verification email on registration (see backend's
  // routes/auth.ts) -- write-only for the password like the Thingiverse token above.
  getSmtp: async (): Promise<SmtpSettings> => {
    const res = await fetch(`${apiBase()}/settings/smtp`, { headers: authHeaders() });
    assertOk(res, "Failed to load SMTP settings");
    return res.json();
  },

  updateSmtp: async (payload: SmtpSettingsInput): Promise<SmtpSettings> => {
    const res = await fetch(`${apiBase()}/settings/smtp`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update SMTP settings"));
    }
    return res.json();
  },

  // Read-only: always reflects the live DATABASE_URL the backend process was started with.
  getDatabase: async (): Promise<DatabaseInfo> => {
    const res = await fetch(`${apiBase()}/settings/database`, { headers: authHeaders() });
    assertOk(res, "Failed to load database info");
    return res.json();
  },
};
