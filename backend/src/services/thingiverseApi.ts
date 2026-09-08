import { IMPORT_BROWSER_USER_AGENT, IMPORT_TIMEOUT_SECONDS } from "../config";
import type { ImportedAuthorInfo, ImportedPageMetadata } from "./importResolvers";

// The official, documented Thingiverse Developer API -- confirmed live to be a clean JSON API
// with none of www.thingiverse.com's Cloudflare bot-management (that domain actively challenges
// automated requests, including its own legacy `download:{id}` links and the internal
// `/api/v2/*` endpoints the website's own frontend uses). api.thingiverse.com sits on a
// separate host, requires its own Access Token (from an app registered at
// thingiverse.com/apps/create -- NOT a browser session cookie, confirmed by a clean
// INVALID_ACCESS_TOKEN response when a real logged-in session token was tried against it), and
// answers with well-formed JSON/plain HTTP errors instead of a challenge page.
const THINGIVERSE_API_BASE = "https://api.thingiverse.com";
const API_TIMEOUT_MS = IMPORT_TIMEOUT_SECONDS * 1000;
const THINGIVERSE_PROVIDER = "thingiverse";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export class ThingiverseAuthError extends Error {
  constructor() {
    super(
      "The Thingiverse Access Token configured for this instance was rejected. Ask an admin to " +
        "update it in Admin Settings (a new one can be generated at thingiverse.com/apps/create).",
    );
    this.name = "ThingiverseAuthError";
  }
}

export function parseThingiverseThingUrl(url: string): { thingId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "thingiverse.com" && host !== "www.thingiverse.com") return null;
  const m1 = parsed.pathname.match(/thing:(\d+)/i);
  if (m1) return { thingId: m1[1] };
  const m2 = parsed.pathname.match(/\/things\/(\d+)/i);
  return m2 ? { thingId: m2[1] } : null;
}

async function fetchThingiverseApiJson(path: string, accessToken: string): Promise<unknown> {
  const url = `${THINGIVERSE_API_BASE}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": IMPORT_BROWSER_USER_AGENT, Accept: "application/json" }, signal: controller.signal });
    const text = await res.text();
    let data: unknown = null;
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (res.status === 401 || res.status === 403) throw new ThingiverseAuthError();
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export type ThingiversePlateFile = { name: string; url: string };
export type ThingiverseGalleryImage = { name: string; url: string };

export type ThingiverseThingResolution = {
  meta: Partial<ImportedPageMetadata>;
  /** Every real file bundled with the Thing (STL/3MF/etc, but also non-model files like PDFs --
   * callers filter by extension), taken from `zip_data.files`. Direct, public CDN URLs -- no
   * auth needed to actually fetch the bytes, only to resolve the Thing itself. */
  plateFiles: ThingiversePlateFile[];
  /** Renders/photos bundled with the Thing, from `zip_data.images` -- fed to
   * attachImportedPreviewImages as extra gallery images alongside the cover thumbnail. */
  galleryImages: ThingiverseGalleryImage[];
};

function extractCreatorAuthor(creator: Record<string, unknown>): { creator: string | null; author: ImportedAuthorInfo | null } {
  const name = typeof creator.name === "string" && creator.name.trim() ? creator.name.trim() : null;
  const externalId = creator.id != null ? String(creator.id) : null;
  if (!externalId) return { creator: name, author: null };
  const publicUrl = typeof creator.public_url === "string" && creator.public_url.trim() ? creator.public_url.trim() : null;
  const author: ImportedAuthorInfo = {
    provider: THINGIVERSE_PROVIDER,
    externalId,
    name,
    // The official API has no separate handle/username field distinct from the display name.
    handle: name,
    bio: null,
    bioTranslated: null,
    links: publicUrl ? [publicUrl] : [],
    avatarUrl: typeof creator.thumbnail === "string" && creator.thumbnail.trim() ? creator.thumbnail.trim() : null,
    backgroundUrl: typeof creator.cover === "string" && creator.cover.trim() ? creator.cover.trim() : null,
  };
  return { creator: name, author };
}

/** Resolves a Thing's metadata (title, description, tags, author, category, preview) and its
 * real, directly-downloadable file list, all from the official api.thingiverse.com API. Returns
 * null for a Thing that doesn't exist / isn't accessible with this token (404); throws
 * ThingiverseAuthError for a rejected token (401/403) so the caller can surface that distinctly
 * from "this one Thing is unavailable". */
export async function resolveThingiverseThing(thingId: string, accessToken: string): Promise<ThingiverseThingResolution | null> {
  const detail = await fetchThingiverseApiJson(`/things/${thingId}`, accessToken);
  if (!isRecord(detail)) return null;

  const meta: Partial<ImportedPageMetadata> = {};
  if (typeof detail.name === "string" && detail.name.trim()) meta.title = detail.name.trim();
  if (typeof detail.description === "string" && detail.description.trim()) meta.description = detail.description.trim();
  if (Array.isArray(detail.tags)) {
    const tags = detail.tags
      .map((t) => (isRecord(t) && typeof t.name === "string" ? t.name.trim() : null))
      .filter((t): t is string => Boolean(t));
    if (tags.length) meta.tags = tags;
  }
  const defaultImage = isRecord(detail.default_image) ? detail.default_image : null;
  const previewImageUrl =
    (defaultImage && typeof defaultImage.url === "string" && defaultImage.url.trim() && defaultImage.url) ||
    (typeof detail.thumbnail === "string" && detail.thumbnail.trim() && detail.thumbnail) ||
    null;
  if (previewImageUrl) meta.previewImageUrl = previewImageUrl;

  if (isRecord(detail.creator)) {
    const { creator, author } = extractCreatorAuthor(detail.creator);
    if (creator) meta.creator = creator;
    if (author) meta.author = author;
  }

  // A separate call (per the official API's shape -- categories aren't inlined on the Thing
  // resource) but cheap and best-effort: category matching just doesn't happen if it fails.
  const categoriesUrl = typeof detail.categories_url === "string" ? detail.categories_url : null;
  if (categoriesUrl) {
    try {
      const categories = await fetchThingiverseApiJson(`/things/${thingId}/categories`, accessToken);
      if (Array.isArray(categories)) {
        const ids = categories
          .map((c) => (isRecord(c) && typeof c.id === "number" ? c.id : null))
          .filter((id): id is number => id !== null);
        if (ids.length) {
          meta.siteCategoryIds = ids;
          meta.categorySite = THINGIVERSE_PROVIDER;
        }
      }
    } catch {
      // Categories are a nice-to-have on top of a Thing that already resolved -- never fail
      // the whole import over this one being unreachable.
    }
  }

  const zipData = isRecord(detail.zip_data) ? detail.zip_data : null;
  const plateFiles: ThingiversePlateFile[] = Array.isArray(zipData?.files)
    ? zipData.files
        .filter((f): f is Record<string, unknown> => isRecord(f) && typeof f.name === "string" && typeof f.url === "string")
        .map((f) => ({ name: f.name as string, url: f.url as string }))
    : [];
  const galleryImages: ThingiverseGalleryImage[] = Array.isArray(zipData?.images)
    ? zipData.images
        .filter((f): f is Record<string, unknown> => isRecord(f) && typeof f.name === "string" && typeof f.url === "string")
        .map((f) => ({ name: f.name as string, url: f.url as string }))
    : [];

  return { meta, plateFiles, galleryImages };
}
