import { authHeaders } from "../utils/auth";
import { apiBase, readErrorMessage, UnauthorizedError } from "./client";
import type { Print } from "./prints";

export type ImportInspectInfo = {
  filename: string;
  mime: string;
  is_zip: boolean;
};

export type ZipEntryInfo = {
  path: string;
  size: number;
};

export type ImportZipResult = {
  prints: Print[];
  failed: string[];
};

export type ImportCollectionEntry = {
  design_id: string;
  title: string;
  cover: string | null;
};

export type ImportCollectionEntriesResult = {
  title: string | null;
  total: number;
  truncated: boolean;
  entries: ImportCollectionEntry[];
};

export type ImportCollectionResult = {
  prints: Print[];
  failed: string[];
};

type ImportLinkPayload = {
  url: string;
  title?: string;
  notes?: string;
  tags?: string[];
  folder_id?: string;
  filename?: string;
  makerworld_cookie?: string;
  thingiverse_cookie?: string;
};

export const importsApi = {
  fromLink: async (payload: ImportLinkPayload) => {
    const res = await fetch(`${apiBase()}/import`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      let message = "Import failed";
      try {
        const data = await res.json();
        if (typeof data?.detail === "string") message = data.detail;
      } catch {
        // ignore parse errors
      }
      throw new Error(message);
    }
    return res.json();
  },

  inspectLink: async (payload: ImportLinkPayload): Promise<ImportInspectInfo> => {
    const res = await fetch(`${apiBase()}/import/inspect`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Inspect failed");
      throw new Error(message);
    }
    return res.json();
  },

  listZipEntries: async (payload: ImportLinkPayload): Promise<{ filename: string; entries: ZipEntryInfo[] }> => {
    const res = await fetch(`${apiBase()}/import/zip/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Zip listing failed");
      throw new Error(message);
    }
    return res.json();
  },

  zipFromLink: async (payload: ImportLinkPayload & { entries: string[] }): Promise<ImportZipResult> => {
    const res = await fetch(`${apiBase()}/import/zip`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Zip import failed");
      throw new Error(message);
    }
    return res.json();
  },

  listCollectionEntries: async (payload: ImportLinkPayload): Promise<ImportCollectionEntriesResult> => {
    const res = await fetch(`${apiBase()}/import/collection/entries`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Could not load collection");
      throw new Error(message);
    }
    return res.json();
  },

  fromCollection: async (payload: ImportLinkPayload & { design_ids: string[] }): Promise<ImportCollectionResult> => {
    const res = await fetch(`${apiBase()}/import/collection`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    });
    if (res.status === 401) {
      throw new UnauthorizedError();
    }
    if (!res.ok) {
      const message = await readErrorMessage(res, "Collection import failed");
      throw new Error(message);
    }
    return res.json();
  },
};
