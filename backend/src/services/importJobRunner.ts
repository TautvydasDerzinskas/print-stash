import fs from "node:fs/promises";
import path from "node:path";
import { mapWithConcurrency, sleep } from "../utils/concurrency";
import { IMPORT_COLLECTION_DELAY_MS } from "../config";
import { updateJob } from "./importJobService";
import { createNotification } from "./notificationService";
import { addPrintsToCollection, findOrCreateCollectionByName } from "./collectionService";
import { resolveMakerworldCookie } from "./importResolvers";
import { extractMakerworldBearerToken } from "./makerworldCloudApi";
import { fetchMakerworldCollectionTitle, parseMakerworldCollectionUrl } from "./makerworldCollections";
import { downloadImportToTemp, importPrintFromUrl, type ImportRequestBody } from "./importService";
import { upsertAuthorFromImport } from "./authorService";
import { extractZipEntriesToPrints } from "./zipService";
import { fetchThingiverseCollectionTitle } from "./thingiverseApi";
import { getThingiverseAccessToken } from "./settingsService";
import { HttpError } from "../utils/fileUtils";

// Deliberately sequential (not a handful in parallel) with a pacing gap between requests --
// firing several designs' worth of api.bambulab.com calls at once, back to back with zero
// pacing, is a burst pattern that looks nothing like a human browsing the site and is the
// most likely reason a large collection trips MakerWorld's anti-abuse CAPTCHA (see
// classifyImportFailure's "rateLimited" case) after only a handful of models. Neither Bambu
// nor bambuddy's independent writeup (#2790) publish an exact threshold, so this isn't a
// guarantee -- just removing the most obviously bot-shaped part of the traffic.
const COLLECTION_IMPORT_CONCURRENCY = 1;

type CollectionImportJobBody = ImportRequestBody & { design_ids: string[] };
type ZipImportJobBody = ImportRequestBody & { entries: string[] };
type ThingiverseLikesImportJobBody = ImportRequestBody & { thing_ids: string[]; username: string };
type ThingiverseCollectionImportJobBody = ImportRequestBody & { thing_ids: string[]; collectionId: string };

// Distinguishes *why* a single design failed, so a batch of many failures reads as one clear
// cause instead of an opaque "N failed":
//  - "unavailable": the model itself is gone -- private, deleted, or hidden (403/404, see
//    fetchWithGuard in importService.ts). Nothing to retry.
//  - "rateLimited": MakerWorld's anti-abuse layer challenged this account with a CAPTCHA
//    (see makerworldCaptchaCooloffActive in makerworldCloudApi.ts) -- once that trips, EVERY
//    remaining item in the batch fails instantly with the same error for the rest of the
//    cooloff (hours, not minutes), which is what turns "a couple of models are unavailable"
//    into "149 of 153 failed" if left unlabeled. Worth its own bucket since the fix (wait,
//    then retry) is completely different.
//  - "auth": the MakerWorld session cookie was rejected outright (401) -- every item fails this
//    way, not just some, so it's really an account-level problem, not a per-model one.
//  - "other": genuinely per-item failures (network hiccup, unparseable page, etc).
type ImportFailureReason = "unavailable" | "rateLimited" | "auth" | "other";

function classifyImportFailure(err: unknown): ImportFailureReason {
  if (err instanceof HttpError) {
    if (err.status === 403 || err.status === 404) return "unavailable";
    if (err.status === 429) return "rateLimited";
    if (err.status === 401) return "auth";
  }
  return "other";
}

async function markJobFailed(jobId: string, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : "Import failed";
  console.error(`Import job ${jobId} failed:`, err);
  await updateJob(jobId, { status: "ERROR", errorMessage: message }).catch(() => undefined);
}

/** Runs a MakerWorld collection's batch import in the background -- see routes/imports.ts's
 * POST /import/collection, which creates the ImportJob row and kicks this off without awaiting
 * it. Mirrors the per-design import logic that used to live inline in that route handler. */
export async function runCollectionImportJob(jobId: string, userId: string, body: CollectionImportJobBody): Promise<void> {
  try {
    let imported = 0;
    let alreadyInLibrary = 0;
    let processed = 0;
    let unavailable = 0;
    let rateLimited = 0;
    let authFailed = 0;
    const failed: string[] = [];
    const successPrintIds: string[] = [];

    await mapWithConcurrency(body.design_ids, COLLECTION_IMPORT_CONCURRENCY, async (designId, index) => {
      const modelUrl = `https://makerworld.com/en/models/${designId}`;
      const itemBody: ImportRequestBody = {
        url: modelUrl,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        folder_id: body.folder_id ?? null,
        makerworld_cookie: body.makerworld_cookie,
      };
      try {
        const { print, alreadyImported } = await importPrintFromUrl(userId, modelUrl, itemBody);
        successPrintIds.push(print.id);
        if (alreadyImported) alreadyInLibrary++;
        else imported++;
      } catch (err) {
        failed.push(designId);
        const reason = classifyImportFailure(err);
        if (reason === "unavailable") unavailable++;
        else if (reason === "rateLimited") rateLimited++;
        else if (reason === "auth") authFailed++;
      } finally {
        processed++;
        // Never let a transient progress-write hiccup on one item cascade into failing the
        // whole batch via the Promise.all in mapWithConcurrency -- the items already imported
        // (successPrintIds) and the ones still to come must not be lost over a single DB blip.
        await updateJob(jobId, { processed, imported, alreadyInLibrary, failedCount: failed.length }).catch(() => undefined);
      }
      if (index < body.design_ids.length - 1) await sleep(IMPORT_COLLECTION_DELAY_MS);
    });

    let resultCollectionId: string | null = null;
    let collectionTitle: string | null = null;
    if (successPrintIds.length) {
      const url = body.url;
      const parsed = parseMakerworldCollectionUrl(url);
      if (parsed) {
        const bearerToken = extractMakerworldBearerToken(resolveMakerworldCookie(body));
        collectionTitle = await fetchMakerworldCollectionTitle(parsed.collectionId, bearerToken);
        if (collectionTitle) {
          const collection = await findOrCreateCollectionByName(userId, collectionTitle);
          await addPrintsToCollection(collection.id, successPrintIds);
          resultCollectionId = collection.id;
        }
      }
    }

    await updateJob(jobId, {
      status: "DONE",
      sourceLabel: collectionTitle,
      resultCollectionId,
      processed,
      imported,
      alreadyInLibrary,
      failedCount: failed.length,
    });

    const label = collectionTitle ? `"${collectionTitle}"` : "a MakerWorld collection";
    const bodyParts: string[] = [];
    if (alreadyInLibrary) bodyParts.push(`${alreadyInLibrary} already in your library`);
    const otherFailed = failed.length - unavailable - rateLimited - authFailed;
    if (unavailable) bodyParts.push(`${unavailable} unavailable (private, deleted, or hidden)`);
    // rateLimited and authFailed both mean the rest of the batch was doomed the moment the
    // first one hit -- see classifyImportFailure above -- so call out the actionable cause
    // instead of just a count, especially since this is usually the bulk of a large failure.
    if (rateLimited) {
      bodyParts.push(
        `${rateLimited} blocked by a MakerWorld CAPTCHA challenge (too many requests at once) — this usually clears in 1-4 hours, then retry the same collection`,
      );
    }
    if (authFailed) bodyParts.push(`${authFailed} failed because your MakerWorld session expired — update the cookie in Settings and retry`);
    if (otherFailed) bodyParts.push(`${otherFailed} failed`);
    await createNotification(userId, {
      title: `Imported ${imported} of ${body.design_ids.length} models from MakerWorld`,
      body: bodyParts.length ? `From ${label} — ${bodyParts.join(", ")}.` : `From ${label}.`,
      externalUrl: body.url,
      internalPath: resultCollectionId ? `/models/collections/${resultCollectionId}` : null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  }
}

/** Shared runner behind both Thingiverse batch import kinds (Likes and named Collections --
 * see the two exported wrappers below): resolves the Access Token once, imports every Thing id
 * with the same pacing/concurrency as the MakerWorld collection job above (same reasoning: a
 * burst of requests reads as automated traffic, worth avoiding even though Thingiverse's
 * official API hasn't shown the same anti-abuse behavior MakerWorld's has), then files every
 * successful import into `collectionTitle` (created on first use, reused on every later import
 * that resolves to the same title -- e.g. every Likes import shares one "Thingiverse Likes"
 * collection; a named Thingiverse Collection gets/reuses a PrintStash Collection of that same
 * name). `resolveCollectionTitle` runs after the per-item loop (not before) so a Collection's
 * real name -- an extra API call -- is only fetched once real work has actually happened. */
async function runThingiverseThingsImportJob(
  jobId: string,
  userId: string,
  body: ImportRequestBody & { thing_ids: string[] },
  resolveCollectionTitle: (accessToken: string) => Promise<string>,
  sourceLabel: (collectionTitle: string) => string,
): Promise<void> {
  try {
    const accessToken = await getThingiverseAccessToken();
    if (!accessToken) {
      throw new HttpError(
        503,
        "Thingiverse import isn't configured for this instance yet -- ask an admin to add an Access Token in Admin Settings.",
      );
    }

    let imported = 0;
    let alreadyInLibrary = 0;
    let processed = 0;
    let unavailable = 0;
    let rateLimited = 0;
    let authFailed = 0;
    const failed: string[] = [];
    const successPrintIds: string[] = [];

    await mapWithConcurrency(body.thing_ids, COLLECTION_IMPORT_CONCURRENCY, async (thingId, index) => {
      const thingUrl = `https://www.thingiverse.com/thing:${thingId}`;
      const itemBody: ImportRequestBody = {
        url: thingUrl,
        notes: body.notes ?? null,
        tags: body.tags ?? [],
        folder_id: body.folder_id ?? null,
      };
      try {
        const { print, alreadyImported } = await importPrintFromUrl(userId, thingUrl, itemBody);
        successPrintIds.push(print.id);
        if (alreadyImported) alreadyInLibrary++;
        else imported++;
      } catch (err) {
        failed.push(thingId);
        const reason = classifyImportFailure(err);
        if (reason === "unavailable") unavailable++;
        else if (reason === "rateLimited") rateLimited++;
        else if (reason === "auth") authFailed++;
      } finally {
        processed++;
        await updateJob(jobId, { processed, imported, alreadyInLibrary, failedCount: failed.length }).catch(() => undefined);
      }
      if (index < body.thing_ids.length - 1) await sleep(IMPORT_COLLECTION_DELAY_MS);
    });

    let resultCollectionId: string | null = null;
    const collectionTitle = await resolveCollectionTitle(accessToken);
    if (successPrintIds.length) {
      const collection = await findOrCreateCollectionByName(userId, collectionTitle);
      await addPrintsToCollection(collection.id, successPrintIds);
      resultCollectionId = collection.id;
    }

    await updateJob(jobId, {
      status: "DONE",
      sourceLabel: collectionTitle,
      resultCollectionId,
      processed,
      imported,
      alreadyInLibrary,
      failedCount: failed.length,
    });

    const bodyParts: string[] = [];
    if (alreadyInLibrary) bodyParts.push(`${alreadyInLibrary} already in your library`);
    const otherFailed = failed.length - unavailable - rateLimited - authFailed;
    if (unavailable) bodyParts.push(`${unavailable} unavailable (private, deleted, or hidden)`);
    // Same idea as the MakerWorld CAPTCHA case above: once Thingiverse's Cloudflare bot-management
    // trips, every remaining item fails the same way for a while, so call out the actionable
    // cause instead of a vague "N failed" -- especially since this is usually the bulk of a
    // large batch's failures once it trips.
    if (rateLimited) {
      bodyParts.push(
        `${rateLimited} blocked by Thingiverse's rate-limit protection (too many requests at once) — wait a while, then retry`,
      );
    }
    if (authFailed) bodyParts.push(`${authFailed} failed because the configured Access Token was rejected`);
    if (otherFailed) bodyParts.push(`${otherFailed} failed`);
    const label = sourceLabel(collectionTitle);
    await createNotification(userId, {
      title: `Imported ${imported} of ${body.thing_ids.length} models from Thingiverse`,
      body: bodyParts.length ? `From ${label} — ${bodyParts.join(", ")}.` : `From ${label}.`,
      externalUrl: body.url,
      internalPath: resultCollectionId ? `/models/collections/${resultCollectionId}` : null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  }
}

/** Runs a Thingiverse user's automatic "Likes" batch import in the background -- see
 * routes/imports.ts's POST /import/thingiverse-likes. Every successfully imported Thing lands in
 * a shared "Thingiverse Likes" collection (one bucket for "things liked on Thingiverse", reused
 * across every user's likes import -- deliberately, matching how the feature was asked for). */
export async function runThingiverseLikesImportJob(jobId: string, userId: string, body: ThingiverseLikesImportJobBody): Promise<void> {
  await runThingiverseThingsImportJob(
    jobId,
    userId,
    body,
    async () => "Thingiverse Likes",
    () => `@${body.username}'s Likes`,
  );
}

/** Runs a named Thingiverse Collection's batch import in the background -- see
 * routes/imports.ts's POST /import/thingiverse-collection. Unlike Likes, a Collection has a real
 * user-given name (fetchThingiverseCollectionTitle) -- successful imports land in a PrintStash
 * Collection of that same name, created on first use and reused if the same Thingiverse
 * Collection is ever imported again. */
export async function runThingiverseCollectionImportJob(
  jobId: string,
  userId: string,
  body: ThingiverseCollectionImportJobBody,
): Promise<void> {
  await runThingiverseThingsImportJob(
    jobId,
    userId,
    body,
    async (accessToken) =>
      (await fetchThingiverseCollectionTitle(body.collectionId, accessToken)) ?? `Thingiverse Collection ${body.collectionId}`,
    (collectionTitle) => `"${collectionTitle}"`,
  );
}

/** Runs a remote zip's selected-entries batch import in the background -- see
 * routes/imports.ts's POST /import/zip. */
export async function runZipImportJob(jobId: string, userId: string, body: ZipImportJobBody): Promise<void> {
  let tempPath: string | null = null;
  try {
    const downloaded = await downloadImportToTemp(body.url, body);
    tempPath = downloaded.tempPath;
    const { filename, meta } = downloaded;
    if (path.extname(filename).toLowerCase() !== ".zip") throw new HttpError(415, "Imported file is not a zip");

    await updateJob(jobId, { sourceLabel: filename, total: body.entries.length });

    const author = await upsertAuthorFromImport(meta.author);
    const { prints, failed } = await extractZipEntriesToPrints(
      userId,
      tempPath,
      body.entries,
      {
        title: body.title ?? meta.title,
        notes: body.notes ?? meta.description,
        tags: body.tags && body.tags.length ? body.tags : meta.tags,
        folderId: body.folder_id,
        creator: meta.creator,
        authorId: author?.id ?? null,
        previewImageUrl: meta.previewImageUrl,
        galleryImages: meta.galleryImages,
      },
      (processed, total, imported, failedSoFar) => {
        void updateJob(jobId, { processed, total, imported, failedCount: failedSoFar });
      },
    );

    await updateJob(jobId, {
      status: "DONE",
      processed: body.entries.length,
      imported: prints.length,
      failedCount: failed.length,
    });

    const bodyParts: string[] = [];
    if (failed.length) bodyParts.push(`${failed.length} failed`);
    await createNotification(userId, {
      title: `Imported ${prints.length} of ${body.entries.length} models from ${filename}`,
      body: bodyParts.length ? `${bodyParts.join(", ")}.` : null,
      externalUrl: body.url,
      internalPath: null,
    });
  } catch (err) {
    await markJobFailed(jobId, err);
  } finally {
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}
