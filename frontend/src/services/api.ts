import { appendTokenToUrl, authHeaders } from "./auth";
import { loadSettings } from "./settings";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// Thrown specifically for the "delete the only remaining plate" 409 so callers
// can show a clear message instead of a generic failure toast.
export class LastPlateError extends Error {
  constructor(message = "Cannot remove the only remaining plate. Delete the print instead.") {
    super(message);
    this.name = "LastPlateError";
  }
}

function assertOk(res: Response, message: string) {
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    throw new Error(message);
  }
}

async function readErrorMessage(res: Response, fallback: string) {
  let body = "";
  try {
    body = await res.text();
  } catch {
    return fallback;
  }
  const trimmed = body.trim();
  if (!trimmed) return fallback;
  try {
    const data = JSON.parse(trimmed);
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
  } catch {
    // ignore JSON parse errors
  }
  return trimmed;
}

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

export type Print = {
  id: string;
  name: string;
  title?: string | null;
  notes?: string | null;
  creator?: string | null;
  collection?: string | null;
  tags: string[];
  folder_id?: string | null;
  storage_path?: string | null;
  plates: Plate[]; // ordered by position, length >= 1
  thumb_url?: string | null; // denormalized = plates[0].thumb_url
  supporting_file_count: number;
  prepared_print?: PreparedPrint | null;
  slicer_url?: string | null;
  slicer_filename?: string | null;
};

export type Folder = { id: string; name: string; tags: string[]; parent_id?: string | null };

export type ImportInspectInfo = {
  filename: string;
  mime: string;
  is_zip: boolean;
};

export type ZipEntryInfo = {
  path: string;
  size: number;
};

export type ImportZipResult = {
  prints: Print[];
  failed: string[];
};

export type ListPrintsResult = {
  items: Print[];
  hasMore: boolean;
  nextOffset?: number;
};

export type UploadPrintsResult = {
  prints: Print[];
};

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

function normalizePublicUrl(raw: string): string | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  return `${protocol}//${trimmed}`.replace(/\/+$/, "");
}

function apiBaseFromPublicUrl(raw: string): string | null {
  return normalizePublicUrl(raw);
}

function apiBaseFromSettings(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const settings = loadSettings();
    return apiBaseFromPublicUrl(settings.network?.publicUrl || "");
  } catch {
    return null;
  }
}

function isLocalHostName(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

// API base URL resolution (browser-reachable). PrintStash's backend serves the built frontend
// and the API from the same origin/port in production, so the default is a same-origin relative
// base ("") — fetch("" + "/prints") just resolves against the current page. The only cases that
// need an explicit base are local dev (Vite's dev server and the backend run on different ports)
// and hosting the frontend separately from the backend (the Settings > Network override).
function resolveApiBase(): string {
  const settingsBase = apiBaseFromSettings();
  if (settingsBase) return settingsBase;

  const envUrl = (import.meta.env.VITE_API_URL as string | undefined) || "";
  const hasWindow = typeof window !== "undefined";
  const host = hasWindow ? window.location.hostname : "localhost";

  if (envUrl) {
    const isAbs = /^(https?:)?\/\//i.test(envUrl);
    if (isAbs) {
      const protocol = hasWindow ? window.location.protocol : "http:";
      const absolute = envUrl.startsWith("//") ? `${protocol}${envUrl}` : envUrl;
      return absolute.replace(/\/$/, "");
    }
    // A bare port like ":8000" or "8000".
    const portOnly = envUrl.replace(/^:?/, "");
    return `http://${host}:${portOnly}`.replace(/\/$/, "");
  }

  // Local dev default: Vite's dev server and `npm run dev` in backend/ both run on localhost,
  // the backend on :8000, with no configuration needed.
  if (isLocalHostName(host)) {
    return `http://${host}:8000`;
  }

  // Otherwise, same origin as the page — the standard production deployment.
  return "";
}

function apiBase(): string {
  return resolveApiBase();
}

export async function listPrints(params: {
  q?: string;
  tags?: string[];
  folder_id?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ListPrintsResult> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.tags && params.tags.length) qs.set("tags", params.tags.join(","));
  if (params.folder_id) qs.set("folder_id", params.folder_id);
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
}

export async function listTags(params: {
  q?: string;
  tags?: string[];
  folder_id?: string;
} = {}): Promise<string[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.tags && params.tags.length) qs.set("tags", params.tags.join(","));
  if (params.folder_id) qs.set("folder_id", params.folder_id);
  const res = await fetch(`${apiBase()}/tags?${qs.toString()}`, {
    headers: authHeaders(),
  });
  assertOk(res, "Failed to list tags");
  return res.json();
}

export async function uploadPrints(
  files: File[],
  opts: {
    title?: string;
    notes?: string;
    tags?: string[];
    folder_id?: string;
    mode?: "separate" | "multiplate";
  } = {}
): Promise<UploadPrintsResult> {
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
}

export async function addPlates(printId: string, files: File[]): Promise<{ print: Print }> {
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
}

export async function deletePlate(printId: string, plateId: string): Promise<{ print: Print }> {
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
}

export async function reorderPlates(printId: string, plateIds: string[]): Promise<{ print: Print }> {
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
}

export async function renamePlate(printId: string, plateId: string, filename: string): Promise<{ print: Print }> {
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
}

export async function importFromLink(payload: {
  url: string;
  title?: string;
  notes?: string;
  tags?: string[];
  folder_id?: string;
  filename?: string;
  makerworld_cookie?: string;
  thingiverse_cookie?: string;
}) {
  const res = await fetch(`${apiBase()}/import`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    let message = "Import failed";
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") message = data.detail;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json();
}

export async function inspectImportLink(payload: {
  url: string;
  title?: string;
  notes?: string;
  tags?: string[];
  folder_id?: string;
  filename?: string;
  makerworld_cookie?: string;
  thingiverse_cookie?: string;
}): Promise<ImportInspectInfo> {
  const res = await fetch(`${apiBase()}/import/inspect`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const message = await readErrorMessage(res, "Inspect failed");
    throw new Error(message);
  }
  return res.json();
}

export async function listImportZipEntries(payload: {
  url: string;
  title?: string;
  notes?: string;
  tags?: string[];
  folder_id?: string;
  filename?: string;
  makerworld_cookie?: string;
  thingiverse_cookie?: string;
}): Promise<{ filename: string; entries: ZipEntryInfo[] }> {
  const res = await fetch(`${apiBase()}/import/zip/entries`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const message = await readErrorMessage(res, "Zip listing failed");
    throw new Error(message);
  }
  return res.json();
}

export async function importZipFromLink(payload: {
  url: string;
  entries: string[];
  title?: string;
  notes?: string;
  tags?: string[];
  folder_id?: string;
  filename?: string;
  makerworld_cookie?: string;
  thingiverse_cookie?: string;
}): Promise<ImportZipResult> {
  const res = await fetch(`${apiBase()}/import/zip`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    const message = await readErrorMessage(res, "Zip import failed");
    throw new Error(message);
  }
  return res.json();
}

export async function setTags(id: string, tags: string[]) {
  const res = await fetch(`${apiBase()}/print/${id}/tags`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ tags }),
  });
  assertOk(res, "Tag update failed");
  return res.json();
}

export async function uploadGeneratedThumbnail(plateId: string, image: Blob): Promise<Print> {
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
}

export async function listPrintFiles(id: string): Promise<PrintFile[]> {
  const res = await fetch(`${apiBase()}/print/${id}/files`, { headers: authHeaders() });
  assertOk(res, "Failed to load supporting files");
  return res.json();
}

export async function uploadPrintFile(id: string, file: File): Promise<Print> {
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
}

export async function deletePrintFile(printId: string, fileId: string): Promise<Print> {
  const res = await fetch(`${apiBase()}/print/${printId}/files/${fileId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  assertOk(res, "Failed to remove supporting file");
  return res.json();
}

export async function deletePreparedPrint(printId: string): Promise<Print> {
  const res = await fetch(`${apiBase()}/print/${printId}/prepared-print`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  assertOk(res, "Failed to clear prepared print");
  return res.json();
}

export async function updatePrintMeta(id: string, payload: {
  name?: string | null;
  title?: string | null;
  notes?: string | null;
  creator?: string | null;
  collection?: string | null;
}) {
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
}

export async function deletePrint(id: string) {
  const res = await fetch(`${apiBase()}/print/${id}`, { method: "DELETE", headers: authHeaders() });
  assertOk(res, "Delete print failed");
  return res.json();
}

export async function updatePrintFolder(id: string, folder_id: string | null) {
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
}

export function fileUrl(rel: string) {
  // API returns relative URLs. Join with API base.
  if (!rel) return rel;
  return appendTokenToUrl(`${apiBase()}${rel}`);
}

// Folders -------------------------------------------------------

export async function listFolders(): Promise<Folder[]> {
  const res = await fetch(`${apiBase()}/folders`, { headers: authHeaders() });
  assertOk(res, "Failed to list folders");
  return res.json();
}

export async function createFolder(name: string, tags: string[] = [], parent_id?: string | null) {
  const res = await fetch(`${apiBase()}/folders`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, tags, parent_id }),
  });
  assertOk(res, "Create folder failed");
  return res.json();
}

export async function updateFolder(id: string, name: string, tags: string[], parent_id?: string | null) {
  const res = await fetch(`${apiBase()}/folder/${id}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name, tags, parent_id }),
  });
  assertOk(res, "Update folder failed");
  return res.json();
}

export async function deleteFolder(id: string) {
  const res = await fetch(`${apiBase()}/folder/${id}`, { method: "DELETE", headers: authHeaders() });
  assertOk(res, "Delete folder failed");
  return res.json();
}

export async function downloadZip(opts: { print_ids?: string[]; tag?: string; folder_id?: string; filename?: string }) {
  const res = await fetch(`${apiBase()}/download/zip`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(opts),
  });
  assertOk(res, "Download failed");
  return res;
}

export async function downloadFolderZip(folder_id: string) {
  const res = await fetch(`${apiBase()}/folder/${folder_id}/download`, { headers: authHeaders() });
  assertOk(res, "Folder download failed");
  return res;
}

export type HealthInfo = { ok: boolean; auth_required: boolean };

export async function apiHealth(): Promise<HealthInfo | null> {
  try {
    const res = await fetch(`${apiBase()}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      auth_required: Boolean(data?.auth_required),
    };
  } catch {
    return null;
  }
}

export function getApiBase() {
  return apiBase();
}

export async function login(username: string, password: string): Promise<{ token: string; expires_in: number }> {
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
}

export async function refreshToken(): Promise<{ token: string; expires_in: number }> {
  const res = await fetch(`${apiBase()}/refresh`, {
    method: "POST",
    headers: authHeaders(),
  });
  assertOk(res, "Token refresh failed");
  return res.json();
}

export async function getMountImportSettings(): Promise<MountImportSettings> {
  const res = await fetch(`${apiBase()}/settings/mount-import`, { headers: authHeaders() });
  assertOk(res, "Failed to load mount import settings");
  return res.json();
}

export async function updateMountImportSettings(payload: {
  enabled: boolean;
  copy_files: boolean;
}): Promise<MountImportSettings> {
  const res = await fetch(`${apiBase()}/settings/mount-import`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(payload),
  });
  assertOk(res, "Failed to update mount import settings");
  return res.json();
}

export async function getStorageSettings(): Promise<StorageSettings> {
  const res = await fetch(`${apiBase()}/settings/storage`, { headers: authHeaders() });
  assertOk(res, "Failed to load storage settings");
  return res.json();
}

export async function updateStorageSettings(payload: {
  template: string;
  apply_existing: boolean;
}): Promise<StorageSettings> {
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
}
