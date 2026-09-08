import { authHeaders } from "../utils/auth";
import { apiBase, assertOk, readErrorMessage } from "./client";

export type AdminUser = {
  id: string;
  email: string;
  display_name: string;
  role: "ADMIN" | "MEMBER";
  print_count: number;
};

export const adminApi = {
  listUsers: async (): Promise<AdminUser[]> => {
    const res = await fetch(`${apiBase()}/admin/users`, { headers: authHeaders() });
    assertOk(res, "Failed to load users");
    return res.json();
  },

  deleteAllPrintsForUser: async (userId: string): Promise<{ deleted: number }> => {
    const res = await fetch(`${apiBase()}/admin/users/${userId}/delete-all-prints`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to delete models"));
    return res.json();
  },
};
