import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage, EmailNotVerifiedError, UnauthorizedError } from "./client";

export type AuthUser = {
  id: string;
  email: string;
  display_name: string;
  role: "ADMIN" | "MEMBER";
  // Set while an email change (Profile > Change email) is awaiting confirmation.
  pending_email: string | null;
  // Populated by linking an imported Author to this account (AuthorPage's "It's me!" button) --
  // shown on this user's own "My models" author page. See authorsApi.link.
  bio: string | null;
  background_url: string | null;
};
export type AuthResult = { token: string; expires_in: number; user: AuthUser };
// /register returns this instead of AuthResult when SMTP is configured -- the account exists but
// isn't signed in yet, pending the link in the verification email.
export type RegisterResult = AuthResult | { email_verification_required: true; email: string };

export type UpdateProfileInput = {
  current_password: string;
  email?: string;
  new_password?: string;
};

async function readAuthError(res: Response): Promise<never> {
  let message = "Request failed";
  let code: string | undefined;
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") message = data.detail;
    if (typeof data?.code === "string") code = data.code;
  } catch {
    // ignore
  }
  if (code === "EMAIL_NOT_VERIFIED") throw new EmailNotVerifiedError(message);
  throw new Error(message);
}

async function postAuth<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return readAuthError(res);
  return res.json();
}

export const authApi = {
  login: (email: string, password: string): Promise<AuthResult> => postAuth("/login", { email, password }),

  register: (payload: { displayName: string; email: string; password: string }): Promise<RegisterResult> =>
    postAuth("/register", { displayName: payload.displayName, email: payload.email, password: payload.password }),

  verifyEmail: (token: string): Promise<AuthResult> => postAuth("/verify-email", { token }),

  resendVerification: (email: string): Promise<{ message: string }> => postAuth("/resend-verification", { email }),

  // Backs Profile's "Change email" and "Change password" pages -- both require current-password
  // re-confirmation, sent through this one shared endpoint (see backend's PATCH /profile).
  updateProfile: async (payload: UpdateProfileInput): Promise<{ user: AuthUser }> => {
    const res = await fetch(`${apiBase()}/profile`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) {
      throw new Error(await readErrorMessage(res, "Failed to update profile"));
    }
    return res.json();
  },

  refresh: async (): Promise<{ token: string; expires_in: number }> => {
    const res = await fetch(`${apiBase()}/refresh`, {
      method: "POST",
      headers: authHeaders(),
    });
    assertOk(res, "Token refresh failed");
    return res.json();
  },

  // Best-effort: this only exists to record the audit-log entry before the frontend clears its
  // local token, so a failure here (offline, already-expired token) must never block logout.
  logout: async (): Promise<void> => {
    try {
      await fetch(`${apiBase()}/logout`, { method: "POST", headers: authHeaders() });
    } catch {
      // ignore
    }
  },
};
