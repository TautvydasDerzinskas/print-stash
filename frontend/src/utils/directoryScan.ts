import { SCAN_EXT_SET } from "../constants/fileTypes";
import { extOf } from "./fileExtensions";
import type { UploadEntry } from "./uploadTree";

function normalizeRelativePath(path: string) {
  return (path || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * The single top-level path segment shared by every entry (e.g. "MyModels" for
 * "MyModels/a.stl" and "MyModels/sub/b.stl"), or "" if the entries don't share one --
 * which is always the case for a flat file-picker selection with no folder structure.
 */
export function findRootSegment(entries: UploadEntry[]): string {
  if (!entries.length) return "";
  const first = normalizeRelativePath(entries[0].relativePath || entries[0].file.name);
  const parts = first.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  const root = parts[0];
  if (!root) return "";
  for (const entry of entries) {
    const normalized = normalizeRelativePath(entry.relativePath || entry.file.name);
    if (!normalized.startsWith(`${root}/`)) {
      return "";
    }
  }
  return root;
}

/**
 * Filters a raw folder-scan selection down to extensions the scan feature supports, and
 * optionally strips a shared leading root segment from each entry's relative path.
 * Returns the filtered entries plus how many were skipped for having an unsupported extension.
 */
export function prepareScanEntries(entries: UploadEntry[], rootSegment: string, stripRoot: boolean) {
  const filtered: UploadEntry[] = [];
  let skipped = 0;
  for (const entry of entries) {
    const ext = extOf(entry.file.name);
    if (!SCAN_EXT_SET.has(ext)) {
      skipped += 1;
      continue;
    }
    let relativePath = normalizeRelativePath(entry.relativePath || entry.file.name);
    if (stripRoot && rootSegment) {
      const parts = relativePath.split("/").filter(Boolean);
      if (parts[0] === rootSegment) {
        parts.shift();
        relativePath = parts.join("/");
      }
    }
    if (!relativePath) {
      relativePath = entry.file.name;
    }
    filtered.push({ ...entry, relativePath });
  }
  return { entries: filtered, skipped };
}

/** Stable dedup key for an upload entry, used to avoid re-uploading the same scanned file twice. */
export function entryKey(entry: UploadEntry): string {
  const relative = normalizeRelativePath(entry.relativePath || entry.file.name);
  return `${relative}::${entry.file.size}::${entry.file.lastModified}`;
}
