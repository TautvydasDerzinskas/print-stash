import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MakerworldCaptchaError,
  makerworldCaptchaCooloffActive,
  resolveMakerworldViaCloudApi,
} from "../src/services/makerworldCloudApi";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const VALID_DESIGN = {
  modelId: "model-1",
  instances: [{ id: "1", profileId: "profile-1" }],
  defaultInstanceId: "1",
};

const VALID_DOWNLOAD = { message: "success", url: "https://example.com/signed-download.3mf" };

describe("resolveMakerworldViaCloudApi", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("retries once on a bare 418 (not yet confirmed as the CAPTCHA shape) instead of giving up immediately", async () => {
    let designCalls = 0;
    global.fetch = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.includes("/design-service/design/")) {
        designCalls++;
        // First call: a bare, non-captcha-shaped 418 -- the transient, request-scoped flag
        // mirrored from maziggy/bambuddy's #2790 writeup, not the real IP-level block.
        if (designCalls === 1) return jsonResponse(418, { error: "temporary" });
        return jsonResponse(200, VALID_DESIGN);
      }
      if (url.includes("/iot-service/api/user/profile/")) {
        return jsonResponse(200, VALID_DOWNLOAD);
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    const result = await resolveMakerworldViaCloudApi("123", null, "test-token");

    expect(designCalls).toBe(2);
    expect(result?.downloadUrl).toBe(VALID_DOWNLOAD.url);
    expect(makerworldCaptchaCooloffActive()).toBe(false);
  });

  it("throws MakerworldCaptchaError and starts the cooloff on a real CAPTCHA challenge, then short-circuits further calls without hitting the network again", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(async (input) => {
      const url = String(input);
      if (url.includes("/design-service/design/")) {
        return jsonResponse(418, { captchaId: "abc123", error: "We need you to confirm you are not a robot" });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(resolveMakerworldViaCloudApi("456", null, "test-token")).rejects.toBeInstanceOf(MakerworldCaptchaError);
    expect(makerworldCaptchaCooloffActive()).toBe(true);

    const callsAfterFirstChallenge = fetchMock.mock.calls.length;
    await expect(resolveMakerworldViaCloudApi("789", null, "test-token")).rejects.toBeInstanceOf(MakerworldCaptchaError);
    // The cooloff guard at the top of resolveMakerworldViaCloudApi should refuse this second
    // call before it ever reaches fetch -- continuing to hit MakerWorld while blocked is
    // exactly what deepens the block, per bambuddy's independent findings.
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstChallenge);
  });
});
