// The frontend always calls the API at same-origin /api/*. In production, the frontend's own
// nginx container reverse-proxies that to the backend (see nginx.conf); in local dev, Vite's
// dev server proxy does the same (see vite.config.js).
export function apiBase(): string {
  return "/api";
}

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

// Thrown specifically for the "delete the only remaining plate" 409 so callers
// can show a clear message instead of a generic failure toast.
export class LastPlateError extends Error {
  constructor(message = "Cannot remove the only remaining plate. Delete the print instead.") {
    super(message);
    this.name = "LastPlateError";
  }
}

// Thrown for /login's 403 EMAIL_NOT_VERIFIED so SignInPanel can show a "resend verification
// email" affordance instead of a plain error message.
export class EmailNotVerifiedError extends Error {
  constructor(message = "Please verify your email before signing in.") {
    super(message);
    this.name = "EmailNotVerifiedError";
  }
}

export function assertOk(res: Response, message: string) {
  if (res.status === 401) {
    throw new UnauthorizedError();
  }
  if (!res.ok) {
    throw new Error(message);
  }
}

export async function readErrorMessage(res: Response, fallback: string) {
  let body = "";
  try {
    body = await res.text();
  } catch {
    return fallback;
  }
  const trimmed = body.trim();
  if (!trimmed) return fallback;
  try {
    const data = JSON.parse(trimmed);
    if (typeof data?.detail === "string" && data.detail.trim()) {
      return data.detail.trim();
    }
  } catch {
    // ignore JSON parse errors
  }
  return trimmed;
}
