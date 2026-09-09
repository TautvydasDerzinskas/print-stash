function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// MakerWorld's anti-abuse layer (distinct from the Cloudflare edge) answers a flagged request
// with a well-formed JSON body naming a captchaId -- sometimes under HTTP 418, sometimes (as
// observed live) under a 200. It's account/IP-scoped, self-clears after a few hours of quiet
// traffic, and cannot be solved without a real browser. Detecting it by shape (not exact
// wording) and reporting it clearly, instead of letting it fall through as "no downloadable file
// found", mirrors maziggy/bambuddy's handling of the same upstream behavior (they hit and
// documented this independently, as issue #2790).
//
// Shared between makerworldCloudApi.ts (design/download-resolution calls) and
// makerworldCollections.ts (collection listing calls, which turned out to be their own burst --
// a large collection's "list entries" step alone can fire a dozen-plus unpaced requests before a
// single model import even starts) -- both surfaces have been observed to answer with this same
// challenge shape, and share one cooldown so a challenge tripped by one doesn't get immediately
// re-tripped by the other.
export function isCaptchaChallenge(data: unknown): boolean {
  if (!isRecord(data)) return false;
  const haystack = Object.entries(data)
    .map(([key, value]) => `${key} ${typeof value === "string" ? value : ""}`)
    .join(" ")
    .toLowerCase();
  return haystack.includes("captchaid") || haystack.includes("captcha") || haystack.includes("robot");
}

export const MAKERWORLD_CAPTCHA_MESSAGE =
  "MakerWorld is challenging this account with a CAPTCHA before it will hand over a download link. " +
  "This can't be solved automatically. Open the model on makerworld.com and click Download there " +
  "once -- that usually clears it -- then retry the import.";

// Once we've seen the challenge, stop sending more automated requests for a while instead of
// retrying into a deepening block (the exact mistake that extends these in practice). The block
// itself is IP-scoped and typically runs 1-4 hours before clearing on its own -- maziggy/
// bambuddy's independent writeup of the same upstream behavior (#2790) confirms this against
// live traffic, and their own comment notes that retrying too soon is "exactly the traffic
// pattern that deepens the block." Two hours undershoots their observed range on purpose: the
// goal here is just to stop a batch import from hammering a block that's already known to be
// active, not to guarantee the very first retry after cooloff succeeds.
const CAPTCHA_COOLOFF_MS = 2 * 60 * 60 * 1000;
let captchaBlockedUntil = 0;

export function makerworldCaptchaCooloffActive(): boolean {
  return Date.now() < captchaBlockedUntil;
}

export function noteCaptchaChallenge(): void {
  captchaBlockedUntil = Date.now() + CAPTCHA_COOLOFF_MS;
}

export class MakerworldCaptchaError extends Error {
  constructor() {
    super(MAKERWORLD_CAPTCHA_MESSAGE);
    this.name = "MakerworldCaptchaError";
  }
}

export class MakerworldAuthError extends Error {
  constructor() {
    super("Your MakerWorld session has expired or was rejected. Update the cookie in Settings and try again.");
    this.name = "MakerworldAuthError";
  }
}
