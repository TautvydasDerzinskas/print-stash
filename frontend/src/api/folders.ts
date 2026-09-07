import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

export type Folder = { id: string; name: string; tags: string[]; parent_id?: string | null };

export const foldersApi = {
  list: async (): Promise<Folder[]> => {
    const res = await fetch(`${apiBase()}/folders`, { headers: authHeaders() });
    assertOk(res, "Failed to list folders");
    return res.json();
  },

  create: async (name: string, tags: string[] = [], parent_id?: string | null) => {
    const res = await fetch(`${apiBase()}/folders`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, tags, parent_id }),
    });
    assertOk(res, "Create folder failed");
    return res.json();
  },

  update: async (id: string, name: string, tags: string[], parent_id?: string | null) => {
    const res = await fetch(`${apiBase()}/folder/${id}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name, tags, parent_id }),
    });
    assertOk(res, "Update folder failed");
    return res.json();
  },

  delete: async (id: string) => {
    const res = await fetch(`${apiBase()}/folder/${id}`, { method: "DELETE", headers: authHeaders() });
    assertOk(res, "Delete folder failed");
    return res.json();
  },

  downloadZip: async (folder_id: string) => {
    const res = await fetch(`${apiBase()}/folder/${folder_id}/download`, { headers: authHeaders() });
    assertOk(res, "Folder download failed");
    return res;
  },
};
