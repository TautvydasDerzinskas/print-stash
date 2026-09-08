import { appendTokenToUrl, authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, LastPlateError, UnauthorizedError } from "./client";

export type PreparedPrint = {
  printer?: string | null;
  material?: string | null;
  nozzle_mm?: number | null;
  layer_height_mm?: number | null;
  estimated_seconds?: number | null;
  format?: string | null; // "gcode" | "bgcode" | "gcode_3mf"
  removable: boolean;
};

export type Plate = {
  id: string;
  print_id: string;
  position: number; // dense, 0-based, ordered
  filename: string;
  mime: string;
  size: number;
  url: string; // /print/{printId}/plate/{plateId}/file/{filename}
  thumb_url?: string | null; // /plate/{plateId}/thumb.jpg?v=... if a thumb exists
};

export type PrintFile = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string; // /print/{printId}/files/{fileId}
};

export type PreviewImage = {
  id: string;
  position: number; // dense, 0-based, ordered; 0 is the default/main image
  url: string; // /preview-image/{id}/file.jpg?v=...
};

export type Author = {
  id: string;
  provider: string;
  external_id: string;
  name: string | null;
  handle: string | null;
  bio: string | null;
  bio_translated: string | null;
  links: string[];
  avatar_url: string | null;
  background_url: string | null;
};

export type Print = {
  id: string;
  name: string;
  title?: string | null;
  notes?: string | null;
  creator?: string | null;
  author?: Author | null;
  collection?: string | null;
  tags: string[];
  folder_id?: string | null;
  storage_path?: string | null;
  plates: Plate[]; // ordered by position, length >= 1
  preview_images: PreviewImage[]; // ordered by position; [0] is the default/main gallery image
  thumb_url?: string | null; // denormalized = plates[0].thumb_url
  supporting_file_count: number;
  prepared_print?: PreparedPrint | null;
  slicer_url?: string | null;
  slicer_filename?: string | null;
  view_count: number;
};

export type ListPrintsResult = {
  items: Print[];
  hasMore: boolean;
  nextOffset?: number;
};

export type UploadPrintsResult = {
  prints: Print[];
};

export const printsApi = {
  // API returns relative URLs. Join with API base.
  fileUrl: (rel: string) => {
    if (!rel) return rel;
    return appendTokenToUrl(`${apiBase()}${rel}`);
  },

  list: async (params: {
    q?: string;
    tags?: string[];
    folder_id?: string | string[];
    limit?: number;
    offset?: number;
  } = {}): Promise<ListPrintsResult> => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.tags && params.tags.length) qs.set("tags", params.tags.join(","));
    if (params.folder_id && params.folder_id.length) {
      qs.set("folder_id", Array.isArray(params.folder_id) ? params.folder_id.join(",") : params.folder_id);
    }
    if (typeof params.limit === "number") qs.set("limit", String(params.limit));
    if (typeof params.offset === "number") qs.set("offset", String(params.offset));
    const res = await fetch(`${apiBase()}/prints?${qs.toString()}`, {
      headers: authHeaders(),
    });
    assertOk(res, "Failed to list prints");
    const items = await res.json();
    const hasMore = (res.headers.get("X-Has-More") || "").toLowerCase() === "true";
    const nextOffsetRaw = res.headers.get("X-Next-Offset");
    const nextOffset = nextOffsetRaw ? Number(nextOffsetRaw) : undefined;
    return { items, hasMore, nextOffset };
  },

  get: async (id: string): Promise<Print> => {
    const res = await fetch(`${apiBase()}/print/${id}`, { headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    assertOk(res, "Failed to load model");
    return res.json();
  },

  listTags: async (params: {
    q?: string;
    tags?: string[];
    folder_id?: string;
  } = {}): Promise<string[]> => {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.tags && params.tags.length) qs.set("tags", params.tags.join(","));
    if (params.folder_id) qs.set("folder_id", params.folder_id);
    const res = await fetch(`${apiBase()}/tags?${qs.toString()}`, {
      headers: authHeaders(),
    });
    assertOk(res, "Failed to list tags");
    return res.json();
  },

  upload: async (
    files: File[],
    opts: {
      title?: string;
      notes?: string;
      tags?: string[];
      folder_id?: string;
      mode?: "separate" | "multiplate";
    } = {}
  ): Promise<UploadPrintsResult> => {
    const fd = new FormData();
    for (const file of files) {
      fd.append("files", file);
    }
    if (opts.title) fd.set("title", opts.title);
    if (opts.notes) fd.set("notes", opts.notes);
    if (opts.tags && opts.tags.length) fd.set("tags", opts.tags.join(","));
    if (opts.folder_id) fd.set("folder_id", opts.folder_id);
    if (opts.mode && files.length > 1) fd.set("mode", opts.mode);
    const res = await fetch(`${apiBase()}/upload`, {
      method: "POST",
      body: fd,
      headers: authHeaders(),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Upload failed");
      throw new Error(message);
    }
    return res.json();
  },

  addPlates: async (printId: string, files: File[]): Promise<{ print: Print }> => {
    const fd = new FormData();
    for (const file of files) {
      fd.append("files", file);
    }
    const res = await fetch(`${apiBase()}/print/${printId}/plates`, {
      method: "POST",
      body: fd,
      headers: authHeaders(),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Failed to add plate");
      throw new Error(message);
    }
    return res.json();
  },

  deletePlate: async (printId: string, plateId: string): Promise<{ print: Print }> => {
    const res = await fetch(`${apiBase()}/print/${printId}/plates/${plateId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (res.status === 409) {
      throw new LastPlateError(await readErrorMessage(res, "Cannot remove the only remaining plate."));
    }
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to remove plate"));
    }
    return res.json();
  },

  reorderPlates: async (printId: string, plateIds: string[]): Promise<{ print: Print }> => {
    const res = await fetch(`${apiBase()}/print/${printId}/plates/reorder`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ plate_ids: plateIds }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to reorder plates"));
    }
    return res.json();
  },

  renamePlate: async (printId: string, plateId: string, filename: string): Promise<{ print: Print }> => {
    const res = await fetch(`${apiBase()}/print/${printId}/plate/${plateId}/rename`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ filename }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Rename failed"));
    }
    return res.json();
  },

  setTags: async (id: string, tags: string[]) => {
    const res = await fetch(`${apiBase()}/print/${id}/tags`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ tags }),
    });
    assertOk(res, "Tag update failed");
    return res.json();
  },

  uploadGeneratedThumbnail: async (plateId: string, image: Blob): Promise<Print> => {
    const body = new FormData();
    body.set("file", image, "thumbnail.png");
    const res = await fetch(`${apiBase()}/plate/${plateId}/thumbnail-generated`, {
      method: "POST",
      headers: authHeaders(),
      body,
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to save generated thumbnail"));
    }
    return res.json();
  },

  listFiles: async (id: string): Promise<PrintFile[]> => {
    const res = await fetch(`${apiBase()}/print/${id}/files`, { headers: authHeaders() });
    assertOk(res, "Failed to load supporting files");
    return res.json();
  },

  uploadFile: async (id: string, file: File): Promise<Print> => {
    const body = new FormData();
    body.set("file", file, file.name);
    const res = await fetch(`${apiBase()}/print/${id}/files`, {
      method: "POST",
      headers: authHeaders(),
      body,
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to add file"));
    }
    return res.json();
  },

  deleteFile: async (printId: string, fileId: string): Promise<Print> => {
    const res = await fetch(`${apiBase()}/print/${printId}/files/${fileId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assertOk(res, "Failed to remove supporting file");
    return res.json();
  },

  deletePreparedPrint: async (printId: string): Promise<Print> => {
    const res = await fetch(`${apiBase()}/print/${printId}/prepared-print`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    assertOk(res, "Failed to clear prepared print");
    return res.json();
  },

  updateMeta: async (id: string, payload: {
    name?: string | null;
    title?: string | null;
    notes?: string | null;
    creator?: string | null;
    collection?: string | null;
  }) => {
    const res = await fetch(`${apiBase()}/print/${id}/meta`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Metadata update failed"));
    }
    return res.json();
  },

  delete: async (id: string) => {
    const res = await fetch(`${apiBase()}/print/${id}`, { method: "DELETE", headers: authHeaders() });
    assertOk(res, "Delete print failed");
    return res.json();
  },

  updateFolder: async (id: string, folder_id: string | null) => {
    const res = await fetch(`${apiBase()}/print/${id}/folder`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ folder_id }),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Folder update failed"));
    }
    return res.json();
  },

  downloadZip: async (opts: { print_ids?: string[]; tag?: string; folder_id?: string; filename?: string }) => {
    const res = await fetch(`${apiBase()}/download/zip`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(opts),
    });
    assertOk(res, "Download failed");
    return res;
  },
};
