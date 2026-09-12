import { authHeaders } from "../utils/auth";
import { apiBase, assertOk } from "./client";
import type { Author } from "./prints";

export type { Author };

export const authorsApi = {
  get: async (id: string): Promise<Author> => {
    const res = await fetch(`${apiBase()}/author/${id}`, { headers: authHeaders() });
    assertOk(res, "Failed to load author");
    return res.json();
  },
};
