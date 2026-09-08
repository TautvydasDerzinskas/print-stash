import { afterEach, describe, expect, it, vi } from "vitest";

const ACCESS_TOKEN = "test-access-token";
const FLARESOLVERR_URL = "http://fake-flaresolverr.test/v1";

function cloudflareChallengeResponse(): Response {
  return new Response("<!doctype html><html><body>Just a moment...</body></html>", {
    status: 429,
    headers: { server: "cloudflare", "cf-mitigated": "challenge", "content-type": "text/html" },
  });
}

/** Mimics FlareSolverr's real reply shape: its headless Chrome renders a JSON API response as
 * its own JSON-viewer DOM (a <pre> tag), not raw JSON text -- see extractJsonFromBrowserBody. */
function flaresolverrEnvelope(thingJson: unknown): Response {
  const rendered = `<html><head></head><body><pre>${JSON.stringify(thingJson)}</pre></body></html>`;
  return new Response(JSON.stringify({ status: "ok", solution: { status: 200, response: rendered } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchThingiverseApiJson FlareSolverr fallback", () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.FLARESOLVERR_URL;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    if (originalEnv === undefined) delete process.env.FLARESOLVERR_URL;
    else process.env.FLARESOLVERR_URL = originalEnv;
    vi.resetModules();
  });

  it("solves a Cloudflare challenge via FlareSolverr, then reuses the proxy for later calls to the same host", async () => {
    // config.ts reads FLARESOLVERR_URL from process.env once, at first import -- must be set
    // before (re-)importing thingiverseApi.ts's dependency chain, hence the dynamic import below
    // instead of a static one (which ES import hoisting would run before this assignment).
    process.env.FLARESOLVERR_URL = FLARESOLVERR_URL;
    vi.resetModules();
    const { resolveThingiverseThing } = await import("../src/services/thingiverseApi");

    let directCalls = 0;
    let flaresolverrCalls = 0;
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.startsWith(FLARESOLVERR_URL)) {
        flaresolverrCalls++;
        return flaresolverrEnvelope({ name: "Rate Limited Thing", zip_data: { files: [], images: [] } });
      }
      if (url.startsWith("https://api.thingiverse.com/")) {
        directCalls++;
        return cloudflareChallengeResponse();
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const first = await resolveThingiverseThing("999", ACCESS_TOKEN);
    expect(first?.meta.title).toBe("Rate Limited Thing");
    expect(directCalls).toBe(1);
    expect(flaresolverrCalls).toBe(1);

    // The host was just seen returning a Cloudflare challenge -- shouldProxyHost's TTL should
    // route this next call straight through FlareSolverr without wasting a direct request first.
    const second = await resolveThingiverseThing("1000", ACCESS_TOKEN);
    expect(second?.meta.title).toBe("Rate Limited Thing");
    expect(directCalls).toBe(1);
    expect(flaresolverrCalls).toBe(2);
  });
});
