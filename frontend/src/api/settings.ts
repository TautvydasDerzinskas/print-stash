import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, UnauthorizedError } from "./client";

export type MountImportSettings = {
  enabled: boolean;
  copy_files: boolean;
  path?: string | null;
};

export type StorageSettings = {
  template: string;
  default_template: string;
  allowed_tokens: string[];
  plate_paths: string[];
  moved: number;
  skipped: number;
};

export const settingsApi = {
  getMountImport: async (): Promise<MountImportSettings> => {
    const res = await fetch(`${apiBase()}/settings/mount-import`, { headers: authHeaders() });
    assertOk(res, "Failed to load mount import settings");
    return res.json();
  },

  updateMountImport: async (payload: {
    enabled: boolean;
    copy_files: boolean;
  }): Promise<MountImportSettings> => {
    const res = await fetch(`${apiBase()}/settings/mount-import`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    assertOk(res, "Failed to update mount import settings");
    return res.json();
  },

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
};
