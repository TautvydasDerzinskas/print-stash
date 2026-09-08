import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";

export type Folder = {
  id: string;
  name: string;
  tags: string[];
  parent_id?: string | null;
  position: number;
  meta_title: string | null;
  meta_description: string | null;
  makerworld_cat_id: number | null;
  thingiverse_cat_id: number | null;
  printables_cat_id: number | null;
};

export type FolderMetaInput = {
  metaTitle: string | null;
  metaDescription: string | null;
  makerworldCatId: number | null;
  thingiverseCatId: number | null;
  printablesCatId: number | null;
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
        makerworld_cat_id: meta.makerworldCatId,
        thingiverse_cat_id: meta.thingiverseCatId,
        printables_cat_id: meta.printablesCatId,
      }),
    });
    assertOk(res, "Update category details failed");
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
