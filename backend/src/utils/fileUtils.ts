import path from "node:path";
import mimeTypes from "mime-types";
import { IMPORT_ALLOWED_EXTS } from "../config";

export function sanitizeFilename(name: string | null | undefined): string {
  let cleaned = (name || "").replace(/\0/g, "").trim();
  cleaned = cleaned.replace(/\//g, "_").replace(/\\/g, "_");
  cleaned = path.basename(cleaned);
  return cleaned || "imported-file";
}

export function parseContentDisposition(cd: string | null | undefined): string | null {
  if (!cd) return null;
  const starMatch = cd.match(/filename\*=([^']*)''([^;]+)/i);
  if (starMatch) return decodeURIComponent(starMatch[2]);
  const plainMatch = cd.match(/filename="?([^";]+)"?/i);
  return plainMatch ? plainMatch[1] : null;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function buildImportFilename(url: string, headers: Headers, override?: string | null): string {
  let name: string;
  if (override) {
    name = sanitizeFilename(override);
  } else {
    const disposition = headers.get("content-disposition");
    name = parseContentDisposition(disposition) || "";
    if (!name) {
      try {
        name = path.basename(new URL(url).pathname);
      } catch {
        name = "";
      }
    }
    name = sanitizeFilename(name);
  }

  const contentType = headers.get("content-type") || "";
  const parsed = path.parse(name);
  let ext = parsed.ext.toLowerCase();
  if (!ext) {
    try {
      ext = path.extname(new URL(url).pathname).toLowerCase();
    } catch {
      ext = "";
    }
  }
  if (!ext && contentType) {
    const guessed = mimeTypes.extension(contentType.split(";")[0].trim());
    ext = guessed ? `.${guessed}` : "";
  }
  if (ext && !name.toLowerCase().endsWith(ext)) {
    name = `${parsed.name || "imported-file"}${ext}`;
  }
  if (!ext) {
    throw new HttpError(415, "Unable to determine file extension");
  }
  if (!IMPORT_ALLOWED_EXTS.has(ext)) {
    throw new HttpError(415, `Unsupported file type: ${ext}`);
  }
  return name;
}

export function mimeFromContentType(contentType: string | null | undefined, filename: string): string {
  const base = (contentType || "").split(";")[0].trim().toLowerCase();
  if (!base || base === "application/octet-stream" || base === "binary/octet-stream") {
    return mimeTypes.lookup(filename) || base || "application/octet-stream";
  }
  return base;
}

export function isHtmlContentType(contentType: string | null | undefined): boolean {
  const base = (contentType || "").split(";")[0].trim().toLowerCase();
  return base === "text/html" || base === "application/xhtml+xml";
}

export function isJsonContentType(contentType: string | null | undefined): boolean {
  const base = (contentType || "").split(";")[0].trim().toLowerCase();
  return base === "application/json" || base === "text/json" || base === "application/ld+json";
}

export function guessMimeFromPath(filePath: string): string {
  return mimeTypes.lookup(filePath) || "application/octet-stream";
}
