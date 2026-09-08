import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, UnauthorizedError } from "./client";

export type Folder = {
  id: string;
  name: string;
  tags: string[];
  parent_id?: string | null;
  position: number;
  meta_title: string | null;
  meta_description: string | null;
  // Semicolon-separated, e.g. "800;71;1001" -- a folder can match more than one upstream
  // category id per site (see backend's routes/folders.ts parseCatIdsInput). Empty string when
  // none are set.
  makerworld_cat_ids: string;
  thingiverse_cat_ids: string;
  printables_cat_ids: string;
};

export type FolderMetaInput = {
  metaTitle: string | null;
  metaDescription: string | null;
  makerworldCatIds: string;
  thingiverseCatIds: string;
  printablesCatIds: string;
};

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

  updateMeta: async (id: string, meta: FolderMetaInput) => {
    const res = await fetch(`${apiBase()}/folder/${id}/meta`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        meta_title: meta.metaTitle,
        meta_description: meta.metaDescription,
        makerworld_cat_ids: meta.makerworldCatIds,
        thingiverse_cat_ids: meta.thingiverseCatIds,
        printables_cat_ids: meta.printablesCatIds,
      }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      // A bad category-id string (e.g. a typo) gets a specific message from the backend --
      // assertOk's fixed fallback text would swallow that, leaving the user without a reason.
      throw new Error(await readErrorMessage(res, "Update category details failed"));
    }
    return res.json();
  },

  /** Persists a new sibling order: `folderIds` must be exactly one category's current children
   *  (or exactly the current root categories), reordered. */
  reorder: async (folderIds: string[]) => {
    const res = await fetch(`${apiBase()}/folders/reorder`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ folder_ids: folderIds }),
    });
    assertOk(res, "Reorder categories failed");
    return res.json();
  },

  downloadZip: async (folder_id: string) => {
    const res = await fetch(`${apiBase()}/folder/${folder_id}/download`, { headers: authHeaders() });
    assertOk(res, "Folder download failed");
    return res;
  },
};
