import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { createJob, getJob } from "../src/services/importJobService";
import { listNotifications } from "../src/services/notificationService";
import { HttpError } from "../src/utils/fileUtils";

// runCollectionImportJob talks to MakerWorld over the network via importPrintFromUrl -- mock
// just that one export (keeping everything else in the module real) so this test can exercise
// the batch-resilience and notification-wording behavior deterministically and offline.
vi.mock("../src/services/importService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/importService")>();
  return { ...actual, importPrintFromUrl: vi.fn<typeof actual.importPrintFromUrl>() };
});

// The real 1s-per-item pacing delay (see IMPORT_COLLECTION_DELAY_MS) exists to avoid a burst
// request pattern against MakerWorld -- irrelevant here since importPrintFromUrl is mocked and
// no real requests happen, so it'd just make this file slow for no reason.
vi.mock("../src/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config")>();
  return { ...actual, IMPORT_COLLECTION_DELAY_MS: 0 };
});

import { importPrintFromUrl } from "../src/services/importService";
import { runCollectionImportJob } from "../src/services/importJobRunner";

const app = createApp();
let userId: string;

beforeAll(async () => {
  const email = `import-job-runner-test-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: "Job Runner Test", email, password: "password123" });
  if (res.status !== 200) {
    throw new Error(`Failed to register during test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
  userId = res.body.user.id;
});

describe("runCollectionImportJob", () => {
  it("processes MakerWorld collection designs strictly one at a time, never in a concurrent burst", async () => {
    // Firing several designs' API calls at once is the traffic shape most likely to trip
    // MakerWorld's anti-abuse CAPTCHA (see COLLECTION_IMPORT_CONCURRENCY's comment in
    // importJobRunner.ts) -- assert the actual concurrency guarantee, not just its intent.
    let active = 0;
    let maxActive = 0;
    const mockedImport = vi.mocked(importPrintFromUrl);
    mockedImport.mockImplementation(async (_userId: string, url: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return {
        print: { id: `print-${url}` } as never,
        plates: [],
        author: null,
        previewImages: [],
        alreadyImported: false,
      };
    });

    const job = await createJob(userId, "COLLECTION", {
      sourceUrl: "https://makerworld.com/en/models/does-not-matter",
      provider: "makerworld",
      total: 4,
    });

    await runCollectionImportJob(job.id, userId, {
      url: "https://makerworld.com/en/models/does-not-matter",
      design_ids: ["30", "31", "32", "33"],
      tags: [],
    });

    expect(maxActive).toBe(1);
    const finished = await getJob(job.id, userId);
    expect(finished?.imported).toBe(4);
  });

  it("skips unavailable/failed models instead of failing the whole batch, and reports them separately", async () => {
    const mockedImport = vi.mocked(importPrintFromUrl);
    mockedImport.mockImplementation(async (_userId: string, url: string) => {
      if (url.endsWith("/1")) {
        return {
          print: { id: "print-1" } as never,
          plates: [],
          author: null,
          previewImages: [],
          alreadyImported: false,
        };
      }
      // A hidden/private/deleted MakerWorld model surfaces as a 403/404 (see fetchWithGuard in
      // importService.ts) -- distinct from an arbitrary failure like a 500.
      if (url.endsWith("/2")) throw new HttpError(404, "Not found");
      throw new HttpError(500, "Boom");
    });

    const job = await createJob(userId, "COLLECTION", {
      sourceUrl: "https://makerworld.com/en/models/does-not-matter",
      provider: "makerworld",
      total: 3,
    });

    await runCollectionImportJob(job.id, userId, {
      url: "https://makerworld.com/en/models/does-not-matter",
      design_ids: ["1", "2", "3"],
      tags: [],
    });

    const finished = await getJob(job.id, userId);
    expect(finished?.status).toBe("DONE");
    expect(finished?.imported).toBe(1);
    expect(finished?.failedCount).toBe(2);

    const { items } = await listNotifications(userId);
    const notification = items.find((n) => n.title.startsWith("Imported 1 of 3"));
    expect(notification).toBeTruthy();
    expect(notification!.body).toBe(
      "From a MakerWorld collection — 1 unavailable (private, deleted, or hidden), 1 failed.",
    );
  });

  it("still marks the job DONE even if every model in the batch is unavailable", async () => {
    const mockedImport = vi.mocked(importPrintFromUrl);
    mockedImport.mockImplementation(async () => {
      throw new HttpError(403, "Forbidden");
    });

    const job = await createJob(userId, "COLLECTION", {
      sourceUrl: "https://makerworld.com/en/models/does-not-matter",
      provider: "makerworld",
      total: 2,
    });

    await runCollectionImportJob(job.id, userId, {
      url: "https://makerworld.com/en/models/does-not-matter",
      design_ids: ["10", "11"],
      tags: [],
    });

    const finished = await getJob(job.id, userId);
    expect(finished?.status).toBe("DONE");
    expect(finished?.imported).toBe(0);
    expect(finished?.failedCount).toBe(2);

    const { items } = await listNotifications(userId);
    const notification = items.find((n) => n.title.startsWith("Imported 0 of 2"));
    expect(notification).toBeTruthy();
    expect(notification!.body).toBe("From a MakerWorld collection — 2 unavailable (private, deleted, or hidden).");
  });

  it("labels a mid-batch CAPTCHA cooloff distinctly instead of an opaque wall of generic failures", async () => {
    // Mirrors the real-world shape that motivated this: a handful of models succeed, then
    // MakerWorld's anti-abuse layer trips and every remaining item in the batch fails the same
    // way (see classifyImportFailure's "rateLimited" case in importJobRunner.ts).
    const mockedImport = vi.mocked(importPrintFromUrl);
    mockedImport.mockImplementation(async (_userId: string, url: string) => {
      if (url.endsWith("/1") || url.endsWith("/2")) {
        return {
          print: { id: `print-${url}` } as never,
          plates: [],
          author: null,
          previewImages: [],
          alreadyImported: false,
        };
      }
      throw new HttpError(429, "MakerWorld is challenging this account with a CAPTCHA...");
    });

    const job = await createJob(userId, "COLLECTION", {
      sourceUrl: "https://makerworld.com/en/models/does-not-matter",
      provider: "makerworld",
      total: 5,
    });

    await runCollectionImportJob(job.id, userId, {
      url: "https://makerworld.com/en/models/does-not-matter",
      design_ids: ["1", "2", "3", "4", "5"],
      tags: [],
    });

    const finished = await getJob(job.id, userId);
    expect(finished?.status).toBe("DONE");
    expect(finished?.imported).toBe(2);
    expect(finished?.failedCount).toBe(3);

    const { items } = await listNotifications(userId);
    const notification = items.find((n) => n.title.startsWith("Imported 2 of 5"));
    expect(notification).toBeTruthy();
    expect(notification!.body).toBe(
      "From a MakerWorld collection — 3 blocked by a MakerWorld CAPTCHA challenge (too many requests at once) — this usually clears in 1-4 hours, then retry the same collection.",
    );
  });

  it("labels an expired MakerWorld session distinctly from a per-model failure", async () => {
    const mockedImport = vi.mocked(importPrintFromUrl);
    mockedImport.mockImplementation(async () => {
      throw new HttpError(401, "Your MakerWorld session has expired or was rejected.");
    });

    const job = await createJob(userId, "COLLECTION", {
      sourceUrl: "https://makerworld.com/en/models/does-not-matter",
      provider: "makerworld",
      total: 1,
    });

    await runCollectionImportJob(job.id, userId, {
      url: "https://makerworld.com/en/models/does-not-matter",
      design_ids: ["20"],
      tags: [],
    });

    const finished = await getJob(job.id, userId);
    expect(finished?.status).toBe("DONE");
    expect(finished?.failedCount).toBe(1);

    const { items } = await listNotifications(userId);
    const notification = items.find((n) => n.title.startsWith("Imported 0 of 1"));
    expect(notification).toBeTruthy();
    expect(notification!.body).toBe(
      "From a MakerWorld collection — 1 failed because your MakerWorld session expired — update the cookie in Settings and retry.",
    );
  });
});
