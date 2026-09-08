import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

// PATCH /folder/:id/meta's makerworld_cat_ids/thingiverse_cat_ids/printables_cat_ids fields:
// free-text "800;71;1001"-style input, parsed and validated by routes/folders.ts's
// parseCatIdsInput into the real Folder.*CatIds int array that importService.ts's
// resolveFolderIdByCategory matches against (see thingiverseImport.test.ts for that side of it).

const app = createApp();
let token: string;

beforeAll(async () => {
  const email = `folder-category-ids-test-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: "Category Ids Test", email, password: "password123" });
  if (res.status !== 200) {
    throw new Error(`Failed to register during test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
  token = res.body.token;
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

async function createFolder(name: string): Promise<string> {
  const res = await request(app).post("/api/folders").set(auth()).send({ name, tags: [] });
  expect(res.status).toBe(200);
  return res.body.id;
}

describe("PATCH /folder/:id/meta -- multi-value category ids", () => {
  it("parses a semicolon-separated string into multiple ids, and round-trips it back the same way", async () => {
    const folderId = await createFolder("Multi Cat Folder");
    const res = await request(app)
      .patch(`/api/folder/${folderId}/meta`)
      .set(auth())
      .send({ thingiverse_cat_ids: "800;71;1001" });

    expect(res.status).toBe(200);
    expect(res.body.thingiverse_cat_ids).toBe("800;71;1001");

    const stored = await prisma.folder.findUnique({ where: { id: folderId } });
    expect(stored?.thingiverseCatIds).toEqual([800, 71, 1001]);
  });

  it("tolerates stray/duplicate separators and whitespace, deduping the result", async () => {
    const folderId = await createFolder("Messy Input Folder");
    const res = await request(app)
      .patch(`/api/folder/${folderId}/meta`)
      .set(auth())
      .send({ makerworld_cat_ids: " 800 ;;71; 800 ;1001;" });

    expect(res.status).toBe(200);
    expect(res.body.makerworld_cat_ids).toBe("800;71;1001");
  });

  it("clears the field on an empty or whitespace-only string", async () => {
    const folderId = await createFolder("Clearable Folder");
    await request(app).patch(`/api/folder/${folderId}/meta`).set(auth()).send({ printables_cat_ids: "42" });

    const res = await request(app).patch(`/api/folder/${folderId}/meta`).set(auth()).send({ printables_cat_ids: "   " });
    expect(res.status).toBe(200);
    expect(res.body.printables_cat_ids).toBe("");

    const stored = await prisma.folder.findUnique({ where: { id: folderId } });
    expect(stored?.printablesCatIds).toEqual([]);
  });

  it("rejects a non-numeric token, naming it in the error", async () => {
    const folderId = await createFolder("Bad Input Folder");
    const res = await request(app)
      .patch(`/api/folder/${folderId}/meta`)
      .set(auth())
      .send({ thingiverse_cat_ids: "800;abc;71" });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("abc");
  });

  it("rejects zero, negative, and decimal ids", async () => {
    const folderId = await createFolder("Invalid Numbers Folder");
    for (const bad of ["0", "-5", "1.5"]) {
      const res = await request(app)
        .patch(`/api/folder/${folderId}/meta`)
        .set(auth())
        .send({ thingiverse_cat_ids: bad });
      expect(res.status).toBe(400);
    }
  });

  it("rejects an excessive number of ids", async () => {
    const folderId = await createFolder("Too Many Ids Folder");
    const manyIds = Array.from({ length: 51 }, (_, i) => i + 1).join(";");
    const res = await request(app)
      .patch(`/api/folder/${folderId}/meta`)
      .set(auth())
      .send({ thingiverse_cat_ids: manyIds });
    expect(res.status).toBe(400);
  });

  it("keeps each site's ids independent of the others", async () => {
    const folderId = await createFolder("Independent Sites Folder");
    const res = await request(app)
      .patch(`/api/folder/${folderId}/meta`)
      .set(auth())
      .send({ makerworld_cat_ids: "1;2", thingiverse_cat_ids: "3;4", printables_cat_ids: "5;6" });

    expect(res.status).toBe(200);
    expect(res.body.makerworld_cat_ids).toBe("1;2");
    expect(res.body.thingiverse_cat_ids).toBe("3;4");
    expect(res.body.printables_cat_ids).toBe("5;6");
  });
});
