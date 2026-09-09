import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { fetchPrintablesCollectionEntries, parsePrintablesCollectionUrl } from "../src/services/printablesApi";
import { prisma } from "../src/db";

// Exercises the Printables Collection listing path against the real shape confirmed live against
// api.printables.com's public GraphQL endpoint (see printablesApi.ts): `moreCollectionModels`
// is the actual query the site's own collection page sends as it lazy-loads more models (found by
// inspecting the real site's network traffic), cursor-paginated with `limit: 30` pages, no auth
// needed. Confirmed live end to end against a real 89-model collection (30+30+29 across 3 pages,
// terminated by an empty-string `cursor` -- not null -- on the last page).

const COLLECTION_ID = "2348006";
const COLLECTION_TITLE = "Printing for printing's sake";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function modelItem(id: number) {
  return { id: String(id), model: { id: String(id), name: `Model ${id}`, slug: `collected-model-${id}`, image: { filePath: `media/prints/${id}/title.jpg` } } };
}

/** An item referencing a print that's since been deleted/hidden -- has `unavailableModel`
 * instead of `model`, and should be silently skipped rather than crash the listing. */
function unavailableItem(id: number) {
  return { id: String(id), unavailableModel: { id: String(id), name: "Deleted print" } };
}

function collectionModelsPage(items: unknown[], cursor: string | null) {
  return jsonResponse(200, { data: { moreCollectionModels: { items, cursor } } });
}

function collectionTitleResponse(name: string | null) {
  return jsonResponse(200, { data: { collection: name ? { id: COLLECTION_ID, name } : null } });
}

/** Routes a mocked fetch to either the title query or the right page of moreCollectionModels,
 * based on the outgoing request body -- fetchPrintablesCollectionEntries fires both in parallel
 * (see printablesApi.ts), and the models query itself gets called once per page with a different
 * `cursor` variable each time. `pages` is keyed by the cursor each page expects to be called
 * with (null for the first page). */
function mockCollectionFetch(opts: { title?: string | null; pages: Record<string, { items: unknown[]; nextCursor: string | null }> }) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (typeof body.query === "string" && body.query.includes("moreCollectionModels")) {
      const cursorKey = body.variables?.cursor ?? "null";
      const page = opts.pages[cursorKey];
      if (!page) throw new Error(`Unexpected cursor requested: ${cursorKey}`);
      return collectionModelsPage(page.items, page.nextCursor);
    }
    return collectionTitleResponse(opts.title ?? null);
  }) as unknown as typeof fetch;
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

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("resolves fully from a single page for a small collection", async () => {
    global.fetch = mockCollectionFetch({
      title: COLLECTION_TITLE,
      pages: { null: { items: [modelItem(1), modelItem(2), modelItem(3)], nextCursor: "" } },
    });

    const listing = await fetchPrintablesCollectionEntries(COLLECTION_ID);

    expect(listing.title).toBe(COLLECTION_TITLE);
    expect(listing.truncated).toBe(false);
    expect(listing.total).toBe(3);
    expect(listing.entries).toEqual([
      { modelId: "1", title: "Collected model 1", cover: "https://media.printables.com/media/prints/1/title.jpg" },
      { modelId: "2", title: "Collected model 2", cover: "https://media.printables.com/media/prints/2/title.jpg" },
      { modelId: "3", title: "Collected model 3", cover: "https://media.printables.com/media/prints/3/title.jpg" },
    ]);
  });

  it("pages through a collection bigger than one page, terminating on an empty-string cursor", async () => {
    global.fetch = mockCollectionFetch({
      title: COLLECTION_TITLE,
      pages: {
        null: { items: [modelItem(1), modelItem(2), modelItem(3)], nextCursor: "page2" },
        page2: { items: [modelItem(4), modelItem(5)], nextCursor: "" },
      },
    });

    const listing = await fetchPrintablesCollectionEntries(COLLECTION_ID);

    // Regression guard for the exact bug found against a real 89-model collection: `total` must
    // reflect every model actually paginated through, not just the first page.
    expect(listing.total).toBe(5);
    expect(listing.truncated).toBe(false);
    expect(listing.entries.map((e) => e.modelId)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("skips items referencing a deleted/unavailable print instead of failing the whole listing", async () => {
    global.fetch = mockCollectionFetch({
      title: COLLECTION_TITLE,
      pages: { null: { items: [modelItem(1), unavailableItem(2), modelItem(3)], nextCursor: "" } },
    });

    const listing = await fetchPrintablesCollectionEntries(COLLECTION_ID);

    expect(listing.entries.map((e) => e.modelId)).toEqual(["1", "3"]);
  });

  it("stops after a bounded number of pages instead of looping forever against a non-terminating cursor", async () => {
    let calls = 0;
    global.fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (typeof body.query === "string" && body.query.includes("moreCollectionModels")) {
        calls++;
        // Always claims there's another page, no matter what cursor was sent -- simulates a
        // pathological/buggy upstream response, exactly what the empty-string-vs-null handling
        // is there to guard against.
        return collectionModelsPage([modelItem(calls)], "still-more");
      }
      return collectionTitleResponse(COLLECTION_TITLE);
    }) as unknown as typeof fetch;

    const listing = await fetchPrintablesCollectionEntries(COLLECTION_ID);

    expect(calls).toBeLessThanOrEqual(20);
    expect(listing.entries.length).toBe(calls);
  });

  it("returns an empty listing for a collection that doesn't exist", async () => {
    global.fetch = mockCollectionFetch({ title: null, pages: { null: { items: [], nextCursor: "" } } });

    const listing = await fetchPrintablesCollectionEntries("999999999999");

    expect(listing.title).toBeNull();
    expect(listing.entries).toEqual([]);
    expect(listing.truncated).toBe(false);
    expect(listing.total).toBe(0);
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
    global.fetch = mockCollectionFetch({ title: COLLECTION_TITLE, pages: { null: { items: [modelItem(1)], nextCursor: "" } } });

    const res = await request(app)
      .post("/api/import/printables-collection/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.printables.com/@joshuaargh/collections/${COLLECTION_ID}`, tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(COLLECTION_TITLE);
    expect(res.body.total).toBe(1);
    expect(res.body.truncated).toBe(false);
    expect(res.body.entries).toEqual([
      { design_id: "1", title: "Collected model 1", cover: "https://media.printables.com/media/prints/1/title.jpg", already_imported: false },
    ]);
  });

  it("aggregates every page's models across the full collection, end to end through the route", async () => {
    global.fetch = mockCollectionFetch({
      title: COLLECTION_TITLE,
      pages: {
        null: { items: [modelItem(1), modelItem(2)], nextCursor: "page2" },
        page2: { items: [modelItem(3)], nextCursor: "" },
      },
    });

    const res = await request(app)
      .post("/api/import/printables-collection/entries")
      .set("Authorization", `Bearer ${token}`)
      .send({ url: `https://www.printables.com/@joshuaargh/collections/${COLLECTION_ID}`, tags: [] });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.truncated).toBe(false);
    expect(res.body.entries.map((e: { design_id: string }) => e.design_id)).toEqual(["1", "2", "3"]);
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
    global.fetch = mockCollectionFetch({ title: COLLECTION_TITLE, pages: { null: { items: [modelItem(1)], nextCursor: "" } } });

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
