import { authHeaders } from "../utils/auth";
import type { AuthUser } from "./auth";
import { apiBase, assertOk, readErrorMessage, UnauthorizedError } from "./client";
import type { Author } from "./prints";

export type { Author };

export const authorsApi = {
  get: async (id: string): Promise<Author> => {
    const res = await fetch(`${apiBase()}/author/${id}`, { headers: authHeaders() });
    assertOk(res, "Failed to load author");
    return res.json();
  },

  /** The Author rows the current user has claimed as themselves -- backs the "My models" page's
   *  provider chips, and lets a real author page work out whether the viewer already has a
   *  different author linked for that same provider (hiding "It's me!" if so). */
  myLinks: async (): Promise<Author[]> => {
    const res = await fetch(`${apiBase()}/me/author-links`, { headers: authHeaders() });
    assertOk(res, "Failed to load linked authors");
    return res.json();
  },

  /** The Author page's "It's me!" button, after its confirmation modal. Throws on the backend's
   *  two uniqueness rules (this author already claimed by someone, or the viewer already has a
   *  different author linked for this provider) -- both are meant to be impossible to reach from
   *  the UI (the button is hidden in both cases), so callers just surface the message rather than
   *  branching on a specific error code. */
  link: async (id: string): Promise<{ author: Author; user: AuthUser }> => {
    const res = await fetch(`${apiBase()}/author/${id}/link`, { method: "POST", headers: authHeaders() });
    if (res.status === 401) throw new UnauthorizedError();
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to link author"));
    return res.json();
  },
};
