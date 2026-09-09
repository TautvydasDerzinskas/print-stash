import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { fetchPrintablesCollectionEntries, parsePrintablesCollectionUrl } from "../src/services/printablesApi";
import { prisma } from "../src/db";

// Exercises the Printables Collection listing path against the real shape confirmed live
// against api.printables.com's public GraphQL endpoint (see printablesApi.ts): `collection(id)`
// exposes name/printsCount/thumbnails11, but thumbnails11 is a hard-capped preview (confirmed:
// it takes no limit/offset/cursor argument) -- collections at or under 11 models resolve fully
// from that alone; bigger ones would need the FlareSolverr scrape fallback, which is not
// exercised here since FLARESOLVERR_URL is unset in the test environment (isFlaresolverrEnabled
//() false), matching how a real instance without FlareSolverr configured behaves: falls back to
// the capped preview with `truncated: true` rather than failing.

const COLLECTION_ID = "2348006";
const COLLECTION_TITLE = "Printing for printing's sake";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function thumbnail(id: number) {
  return { id, slug: `collected-model-${id}`, image: { filePath: `media/prints/${id}/title.jpg` } };
}

function collectionGraphqlResponse(printsCount: number, thumbnailCount: number) {
  return jsonResponse(200, {
    data: {
      collection: {
        id: COLLECTION_ID,
        name: COLLECTION_TITLE,
        printsCount,
        thumbnails11: Array.from({ length: thumbnailCount }, (_, i) => thumbnail(i + 1)),
      },
    },
  });
}

describe("parsePrintablesCollectionUrl", () => {
  it("recognizes a Collection page, with or without the @handle prefix", () => {
    expect(parsePrintablesCollectionUrl(`https://www.printables.com/@joshuaargh/collections/${COLLECTION_ID}`)).toEqual({
      collectionId: COLLECTION_ID,
    });
    expect(parsePrintablesCollectionUrl(`https://www.printables.com/collections/${COLLECTION_ID}`)).toEqual({
      collectionId: COLLECTION_ID,
    });
  });

  it("rejects a single model URL, a profile page, and unrelated hosts", () => {
    expect(parsePrintablesCollectionUrl("https://www.printables.com/model/1786545-strong-garden-hose-holder")).toBeNull();
    expect(parsePrintablesCollectionUrl("https://www.printables.com/@joshuaargh")).toBeNull();
    expect(parsePrintablesCollectionUrl(`https://example.com/collections/${COLLECTION_ID}`)).toBeNull();
  });
});

describe("fetchPrintablesCollectionEntries", () => {
  const originalFetch = global.fetch;
  const pageUrl = `https://www.printables.com/@joshuaargh/collections/${COLLECTION_ID}`;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves fully from the API alone when the collection is at or under the 11-item preview cap", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => collectionGraphqlResponse(5, 5)) as unknown as typeof fetch;

    const listing = await fetchPrintablesCollectionEntries(COLLECTION_ID, pageUrl);

    expect(listing.title).toBe(COLLECTION_TITLE);
    expect(listing.truncated).toBe(false);
    expect(listing.entries).toEqual([
      { modelId: "1", title: "Collected model 1", cover: "https://media.printables.com/media/prints/1/title.jpg" },
      { modelId: "2", title: "Collected model 2", cover: "https://media.printables.com/media/prints/2/title.jpg" },
      { modelId: "3", title: "Collected model 3", cover: "https://media.printables.com/media/prints/3/title.jpg" },
      { modelId: "4", title: "Collected model 4", cover: "https://media.printables.com/media/prints/4/title.jpg" },
      { modelId: "5", title: "Collected model 5", cover: "https://media.printables.com/media/prints/5/title.jpg" },
    ]);
  });

  it("falls back to the 11-item preview, flagged truncated, when the collection is bigger and no scrape path is available", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => collectionGraphqlResponse(34, 11)) as unknown as typeof fetch;

    const listing = await fetchPrintablesCollectionEntries(COLLECTION_ID, pageUrl);

    expect(listing.title).toBe(COLLECTION_TITLE);
    expect(listing.truncated).toBe(true);
    expect(listing.entries).toHaveLength(11);
  });

  it("returns an empty listing for a collection that doesn't exist", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => jsonResponse(200, { data: { collection: null } })) as unknown as typeof fetch;

    const listing = await fetchPrintablesCollectionEntries("999999999999", pageUrl);

    expect(listing.title).toBeNull();
    expect(listing.entries).toEqual([]);
    expect(listing.truncated).toBe(false);
  });
});

describe("POST /import/printables-collection/entries", () => {
  const app = createApp();
  let token: string;
  let userId: string;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    const email = `printables-collection-route-test-${Date.now()}@example.com`;
    const res = await request(app)
      .post("/api/register")
      .send({ displayName: "Printables Collection Route Test", email, password: "password123" });
    if (res.status !== 200) {
      throw new Error(`Failed to register during test setup: ${res.status} ${JSON.stringify(res.body)}`);
    }
    token = res.body.token;
    userId = res.body.user.id;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("lists a collection's models as importable entries, with the real collection name as title", async () => {
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => collectionGraphqlResponse(1, 1)) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/import/printables-collection/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.printables.com/@joshuaargh/collections/${COLLECTION_ID}`, tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(COLLECTION_TITLE);
    expect(res.body.entries).toEqual([
      { design_id: "1", title: "Collected model 1", cover: "https://media.printables.com/media/prints/1/title.jpg", already_imported: false },
    ]);
  });

  it("flags an entry already in the user's library instead of letting it be re-selected", async () => {
    await prisma.print.create({
      data: {
        userId,
        name: "Already imported",
        nameNormalized: "already imported",
        sourceProvider: "printables",
        sourceExternalId: "1",
      },
    });
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async () => collectionGraphqlResponse(1, 1)) as unknown as typeof fetch;

    const res = await request(app)
      .post("/api/import/printables-collection/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.printables.com/@joshuaargh/collections/${COLLECTION_ID}`, tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([
      { design_id: "1", title: "Collected model 1", cover: "https://media.printables.com/media/prints/1/title.jpg", already_imported: true },
    ]);
  });

  it("rejects a URL that isn't a Printables Collection page", async () => {
    const res = await request(app)
      .post("/api/import/printables-collection/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: "https://www.printables.com/@joshuaargh", tags: [] });
    expect(res.status).toBe(400);
  });
});
