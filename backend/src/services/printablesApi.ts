import { IMPORT_BROWSER_USER_AGENT, IMPORT_HTML_MAX_BYTES, IMPORT_TIMEOUT_SECONDS } from "../config";
import { HttpError } from "../utils/fileUtils";
import { extractNextDataJson, htmlToPlainText, type ImportedAuthorInfo, type ImportedPageMetadata } from "./importResolvers";
import { fetchViaFlaresolverr, isFlaresolverrEnabled } from "./flaresolverr";

// The public api.printables.com GraphQL endpoint -- unlike www.printables.com (Cloudflare-gated,
// confirmed via a plain fetch returning its "Just a moment..." challenge page), api.printables.com
// answers a bare unauthenticated POST directly, confirmed live against a real model id. No cookie,
// no bearer token, no FlareSolverr proxying needed for any of the requests below.
const PRINTABLES_GRAPHQL_URL = "https://api.printables.com/graphql/";
const PRINTABLES_MEDIA_BASE = "https://media.printables.com/";
const API_TIMEOUT_MS = IMPORT_TIMEOUT_SECONDS * 1000;
const PRINTABLES_PROVIDER = "printables";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mediaUrl(filePath: unknown): string | null {
  return typeof filePath === "string" && filePath.trim() ? `${PRINTABLES_MEDIA_BASE}${filePath.trim()}` : null;
}

export function parsePrintablesModelUrl(url: string): { modelId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "printables.com" && host !== "www.printables.com") return null;
  const m = parsed.pathname.match(/\/model\/(\d+)/i);
  return m ? { modelId: m[1] } : null;
}

async function fetchPrintablesGraphql(query: string, variables: Record<string, unknown>): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(PRINTABLES_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "User-Agent": IMPORT_BROWSER_USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: "https://www.printables.com",
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  if (res.status === 429) throw new HttpError(429, "Printables rate-limited this request. Wait a bit and try again.");
  if (!res.ok) return null;
  if (text.length > IMPORT_HTML_MAX_BYTES) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parsePrintablesErrorMessages(errors: unknown): string | null {
  if (!Array.isArray(errors)) return null;
  const messages: string[] = [];
  for (const err of errors) {
    if (!err || typeof err !== "object") continue;
    const values = (err as Record<string, unknown>).messages;
    if (Array.isArray(values)) {
      for (const v of values) if (typeof v === "string" && v.trim()) messages.push(v.trim());
    }
  }
  return messages.length ? messages.join(", ") : null;
}

const MODEL_QUERY = `
  query ($id: ID!) {
    print(id: $id) {
      id
      name
      description
      user { id handle publicUsername avatarFilePath }
      image { filePath }
      images { filePath }
      tags { name }
      category { id name }
      stls { id name }
    }
  }
`;

const DOWNLOAD_LINK_MUTATION = `
  mutation ($printId: ID!, $source: DownloadSourceEnum!, $files: [DownloadFileInput!]) {
    getDownloadLink(printId: $printId, source: $source, files: $files) {
      ok
      errors { field messages code }
      output { files { id link } }
    }
  }
`;

function extractAuthor(user: Record<string, unknown>): ImportedAuthorInfo | null {
  const externalId = user.id != null ? String(user.id) : null;
  if (!externalId) return null;
  const handle = typeof user.handle === "string" && user.handle.trim() ? user.handle.trim() : null;
  const name =
    (typeof user.publicUsername === "string" && user.publicUsername.trim() && user.publicUsername.trim()) || handle;
  return {
    provider: PRINTABLES_PROVIDER,
    externalId,
    name,
    handle,
    bio: null,
    bioTranslated: null,
    links: handle ? [`https://www.printables.com/@${handle}`] : [],
    avatarUrl: mediaUrl(user.avatarFilePath),
    backgroundUrl: null,
  };
}

export type PrintablesPlateFile = { name: string; id: string };
export type PrintablesGalleryImage = { name: string; url: string };

export type PrintablesModelResolution = {
  meta: Partial<ImportedPageMetadata>;
  /** The model's actual model files (`.3mf`/`.stl`/`.step`/etc, per the `stls` bucket -- despite
   * the name, Printables uses it for every generic model-file upload, not literally STL-only).
   * Deliberately excludes the `gcodes`/`slas` buckets: those are pre-sliced, printer/material-
   * specific output, not the kind of generic model file the other providers import either. Each
   * still needs its actual download link resolved separately (see resolvePrintablesDownloadLinks
   * below) -- the id here is Printables' file id, not yet a URL. */
  plateFiles: PrintablesPlateFile[];
  /** The model's photo gallery (includes the cover image too) -- fed to
   * attachImportedPreviewImages as extra gallery images alongside the cover thumbnail, same as
   * ThingiverseThingResolution.galleryImages. */
  galleryImages: PrintablesGalleryImage[];
};

/** Resolves a Printables model's metadata (title, description, tags, author, category, cover +
 * gallery images) and its file list (ids + names only -- see resolvePrintablesDownloadLinks for
 * turning those into actual download URLs) from the public GraphQL API. Returns null for a
 * model that doesn't exist / isn't public. */
export async function resolvePrintablesModel(modelId: string): Promise<PrintablesModelResolution | null> {
  const data = (await fetchPrintablesGraphql(MODEL_QUERY, { id: modelId })) as
    | { data?: { print?: Record<string, unknown> } }
    | null;
  const model = data?.data?.print;
  if (!isRecord(model)) return null;

  const meta: Partial<ImportedPageMetadata> = {};
  if (typeof model.name === "string" && model.name.trim()) meta.title = model.name.trim();
  if (typeof model.description === "string" && model.description.trim()) {
    const plainText = htmlToPlainText(model.description);
    if (plainText) meta.description = plainText;
  }
  if (Array.isArray(model.tags)) {
    const tags = model.tags
      .map((t) => (isRecord(t) && typeof t.name === "string" ? t.name.trim() : null))
      .filter((t): t is string => Boolean(t));
    if (tags.length) meta.tags = tags;
  }

  const cover = isRecord(model.image) ? mediaUrl(model.image.filePath) : null;
  if (cover) meta.previewImageUrl = cover;
  const galleryImages: PrintablesGalleryImage[] = Array.isArray(model.images)
    ? model.images
        .map((img, idx) => (isRecord(img) ? { name: `image-${idx}.jpg`, url: mediaUrl(img.filePath) } : null))
        .filter((img): img is PrintablesGalleryImage & { url: string } => Boolean(img?.url))
    : [];

  if (isRecord(model.user)) {
    const author = extractAuthor(model.user);
    if (author) {
      meta.author = author;
      meta.creator = author.name;
    }
  }

  if (isRecord(model.category) && model.category.id != null) {
    const categoryId = Number(model.category.id);
    if (Number.isFinite(categoryId)) {
      meta.siteCategoryIds = [categoryId];
      meta.categorySite = PRINTABLES_PROVIDER;
    }
  }

  const plateFiles: PrintablesPlateFile[] = Array.isArray(model.stls)
    ? model.stls
        .filter((f): f is Record<string, unknown> => isRecord(f) && typeof f.name === "string" && f.id != null)
        .map((f) => ({ name: f.name as string, id: String(f.id) }))
    : [];

  return { meta, plateFiles, galleryImages };
}

/** Resolves the real, time-limited download link for each of a model's files (Printables never
 * exposes a static/direct URL for a model file -- every download has to go through this mutation
 * first) in one batched call. Best-effort per file: a file missing from the response just won't
 * become a plate, same as importThingiverseThing's tolerance for individual unreachable files. */
export async function resolvePrintablesDownloadLinks(
  modelId: string,
  fileIds: string[],
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (!fileIds.length) return links;

  const data = (await fetchPrintablesGraphql(DOWNLOAD_LINK_MUTATION, {
    printId: modelId,
    source: "model_detail",
    files: [{ fileType: "stl", ids: fileIds }],
  })) as { data?: { getDownloadLink?: Record<string, unknown> } } | null;

  const result = data?.data?.getDownloadLink;
  if (!isRecord(result)) return links;
  if (result.ok === false) {
    const message = parsePrintablesErrorMessages(result.errors);
    throw new HttpError(400, message || "Printables rejected the download request");
  }
  const output = result.output;
  const files = isRecord(output) ? output.files : null;
  if (Array.isArray(files)) {
    for (const entry of files) {
      if (isRecord(entry) && entry.id != null && typeof entry.link === "string" && entry.link.trim()) {
        links.set(String(entry.id), entry.link.trim());
      }
    }
  }
  return links;
}

// -- Collections ---------------------------------------------------------------------------

/** A user-curated, named "Collection" -- Printables' bookmark mechanism, one per URL like
 * `printables.com/@handle/collections/{id}`. The `@handle` segment is cosmetic (only the
 * numeric id is used against the API), same as Thingiverse's own Collection URLs. */
export function parsePrintablesCollectionUrl(url: string): { collectionId: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "printables.com" && host !== "www.printables.com") return null;
  const m = parsed.pathname.match(/\/collections\/(\d+)/i);
  return m ? { collectionId: m[1] } : null;
}

export type PrintablesCollectionEntry = { modelId: string; title: string; cover: string | null };

const COLLECTION_QUERY = `
  query ($id: ID!) {
    collection(id: $id) {
      id
      name
      printsCount
      thumbnails11 { id slug image { filePath } }
    }
  }
`;

/** Printables has no human-readable name on a thumbnail-only listing (ThumbnailPrintType has no
 * `name` field, only `slug`) -- turns "prusa-core-one-nozzle-wiper-remix" into "Prusa core one
 * nozzle wiper remix" so the collection picker shows something readable instead of a raw slug. */
function titleFromSlug(slug: string): string {
  const words = slug.split("-").filter(Boolean);
  if (!words.length) return slug;
  return words[0].charAt(0).toUpperCase() + words[0].slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}

function entryFromThumbnail(item: unknown): PrintablesCollectionEntry | null {
  if (!isRecord(item) || item.id == null || typeof item.slug !== "string" || !item.slug.trim()) return null;
  const cover = isRecord(item.image) ? mediaUrl(item.image.filePath) : null;
  return { modelId: String(item.id), title: titleFromSlug(item.slug.trim()), cover };
}

const COLLECTION_SCRAPE_MAX_ENTRIES = 300;

/** Best-effort full listing for a collection bigger than the public API's hard 11-item preview
 * cap (see fetchPrintablesCollectionEntries) -- renders the actual collection page through
 * FlareSolverr (the same Cloudflare-bypass path already used elsewhere in this codebase) and
 * walks its embedded __NEXT_DATA__ payload for print-shaped objects ({id, slug, image} --
 * matching the exact PrintType/ThumbnailPrintType shape confirmed against the live GraphQL
 * schema), rather than relying on any specific, unconfirmed path into that JSON -- Next.js's
 * SSR payload shape isn't part of any public contract and could shift at any time.
 * Returns null (never throws) on anything short of a clean, useful result: FlareSolverr not
 * configured, the fetch failing, no __NEXT_DATA__ found, or nothing print-shaped inside it --
 * every case the caller falls back to the always-available 11-item preview for instead. */
async function scrapeFullPrintablesCollection(pageUrl: string): Promise<PrintablesCollectionEntry[] | null> {
  if (!isFlaresolverrEnabled()) return null;
  const solved = await fetchViaFlaresolverr(pageUrl);
  if (!solved || !solved.body) return null;
  const nextData = extractNextDataJson(solved.body);
  if (!nextData) return null;

  const found = new Map<string, PrintablesCollectionEntry>();
  const stack: unknown[] = [nextData];
  let visited = 0;
  while (stack.length && visited < 50000 && found.size < COLLECTION_SCRAPE_MAX_ENTRIES) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) {
      stack.push(...node);
      continue;
    }
    if (!isRecord(node)) continue;
    const entry = entryFromThumbnail(node);
    if (entry && !found.has(entry.modelId)) found.set(entry.modelId, entry);
    stack.push(...Object.values(node));
  }
  return found.size ? Array.from(found.values()) : null;
}

const COLLECTION_TITLE_QUERY = `query ($id: ID!) { collection(id: $id) { id name } }`;

/** Cheap, title-only fetch -- used by the job runner once the batch import is done (see
 * importJobRunner.ts's runPrintablesCollectionImportJob), so the PrintStash Collection it files
 * results into doesn't require re-running the (potentially FlareSolverr-backed) full listing. */
export async function fetchPrintablesCollectionTitle(collectionId: string): Promise<string | null> {
  const data = (await fetchPrintablesGraphql(COLLECTION_TITLE_QUERY, { id: collectionId })) as
    | { data?: { collection?: Record<string, unknown> } }
    | null;
  const name = data?.data?.collection?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** Resolves a Printables Collection's title and model list. The public GraphQL API only ever
 * exposes up to 11 models per collection (`thumbnails11` -- confirmed live: it takes no
 * limit/offset/cursor argument, and there is no separate paginated "list every model in this
 * collection" operation anywhere in Printables' own site traffic either) -- for anything bigger,
 * this falls back to best-effort page-scraping via FlareSolverr (see
 * scrapeFullPrintablesCollection). `truncated` reflects whichever source ultimately won: false
 * only when every model in the collection was actually returned. */
export async function fetchPrintablesCollectionEntries(
  collectionId: string,
  pageUrl: string,
): Promise<{ title: string | null; entries: PrintablesCollectionEntry[]; truncated: boolean }> {
  const data = (await fetchPrintablesGraphql(COLLECTION_QUERY, { id: collectionId })) as
    | { data?: { collection?: Record<string, unknown> } }
    | null;
  const collection = data?.data?.collection;
  if (!isRecord(collection)) return { title: null, entries: [], truncated: false };

  const title = typeof collection.name === "string" && collection.name.trim() ? collection.name.trim() : null;
  const printsCount = typeof collection.printsCount === "number" ? collection.printsCount : null;
  const preview = Array.isArray(collection.thumbnails11)
    ? collection.thumbnails11.map(entryFromThumbnail).filter((e): e is PrintablesCollectionEntry => e !== null)
    : [];

  if (printsCount === null || preview.length >= printsCount) {
    return { title, entries: preview, truncated: false };
  }

  const scraped = await scrapeFullPrintablesCollection(pageUrl);
  if (scraped && scraped.length > preview.length) {
    return { title, entries: scraped, truncated: scraped.length < printsCount };
  }
  return { title, entries: preview, truncated: true };
}
