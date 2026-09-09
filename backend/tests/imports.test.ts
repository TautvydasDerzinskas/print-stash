import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../src/app";
import { prisma } from "../src/db";
import { identifySourceModel, importPrintFromUrl } from "../src/services/importService";
import { createJob, getActiveJob, updateJob } from "../src/services/importJobService";
import { createNotification, listNotifications, markAllRead } from "../src/services/notificationService";

const app = createApp();
let token: string;
let userId: string;

function tmpFile(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "printstash-test-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

beforeAll(async () => {
  const email = `imports-test-${Date.now()}@example.com`;
  const res = await request(app)
    .post("/api/register")
    .send({ displayName: "Imports Test", email, password: "password123" });
  if (res.status !== 200) {
    throw new Error(`Failed to register during test setup: ${res.status} ${JSON.stringify(res.body)}`);
  }
  token = res.body.token;
  userId = res.body.user.id;
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

describe("identifySourceModel", () => {
  it("extracts a provider + design id from a MakerWorld model URL", () => {
    expect(identifySourceModel("https://makerworld.com/en/models/681234-some-slug")).toEqual({
      provider: "makerworld",
      externalId: "681234",
    });
  });

  it("returns null for a non-MakerWorld URL", () => {
    expect(identifySourceModel("https://example.com/models/681234")).toBeNull();
  });

  it("returns null for a MakerWorld URL that isn't a model page", () => {
    expect(identifySourceModel("https://makerworld.com/en/collections/12345-name")).toBeNull();
  });

  it("extracts a provider + model id from a Printables model URL", () => {
    expect(identifySourceModel("https://www.printables.com/model/1786545-strong-garden-hose-holder")).toEqual({
      provider: "printables",
      externalId: "1786545",
    });
  });

  it("returns null for a Printables URL that isn't a model page", () => {
    expect(identifySourceModel("https://www.printables.com/@s0ren")).toBeNull();
  });
});

describe("import dedup", () => {
  it("reuses an existing print instead of re-downloading when it was already imported from this source", async () => {
    const uploadRes = await request(app)
      .post("/api/upload")
      .set(auth())
      .attach("files", tmpFile("dedup-me.stl", "solid dedup endsolid"));
    expect(uploadRes.status).toBe(200);
    const printId = uploadRes.body.prints[0].id;

    // Uploads don't go through importPrintFromUrl, so backfill the source identity directly --
    // equivalent to what a real MakerWorld import would have stamped on create.
    await prisma.print.update({
      where: { id: printId },
      data: { sourceProvider: "makerworld", sourceExternalId: "999111" },
    });

    const countBefore = await prisma.print.count({ where: { userId } });

    const result = await importPrintFromUrl(userId, "https://makerworld.com/en/models/999111-dedup-slug", {
      url: "https://makerworld.com/en/models/999111-dedup-slug",
      tags: [],
    });

    expect(result.alreadyImported).toBe(true);
    expect(result.print.id).toBe(printId);

    const countAfter = await prisma.print.count({ where: { userId } });
    expect(countAfter).toBe(countBefore);

    await request(app).delete(`/api/print/${printId}`).set(auth());
  });
});

describe("import job lock", () => {
  it("blocks a new batch import while one is already running, and reports it via the active/job endpoints", async () => {
    const job = await createJob(userId, "COLLECTION", {
      sourceUrl: "https://makerworld.com/en/collections/1-test",
      provider: "makerworld",
      total: 5,
    });

    const collectionRes = await request(app)
      .post("/api/import/collection")
      .set(auth())
      .send({ url: "https://makerworld.com/en/collections/1-test", design_ids: ["1"] });
    expect(collectionRes.status).toBe(409);

    const zipRes = await request(app)
      .post("/api/import/zip")
      .set(auth())
      .send({ url: "https://example.com/some.zip", entries: ["a.stl"] });
    expect(zipRes.status).toBe(409);

    const activeRes = await request(app).get("/api/import/jobs/active").set(auth());
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.id).toBe(job.id);
    expect(activeRes.body.status).toBe("RUNNING");

    const jobRes = await request(app).get(`/api/import/jobs/${job.id}`).set(auth());
    expect(jobRes.status).toBe(200);
    expect(jobRes.body.total).toBe(5);

    await updateJob(job.id, { status: "DONE" });
    expect(await getActiveJob(userId)).toBeNull();
  });
});

describe("notifications", () => {
  it("lists notifications with an accurate unread count, clearable via mark-all-read", async () => {
    await createNotification(userId, { title: "Test notification A", externalUrl: "https://example.com/a" });
    await createNotification(userId, { title: "Test notification B", internalPath: "/models/collections/xyz" });

    const before = await listNotifications(userId);
    expect(before.unreadCount).toBeGreaterThanOrEqual(2);
    expect(before.items.some((n) => n.title === "Test notification A")).toBe(true);

    const listRes = await request(app).get("/api/notifications").set(auth());
    expect(listRes.status).toBe(200);
    expect(listRes.body.unread_count).toBeGreaterThanOrEqual(2);

    const readRes = await request(app).post("/api/notifications/read-all").set(auth());
    expect(readRes.status).toBe(200);

    const after = await listNotifications(userId);
    expect(after.unreadCount).toBe(0);
    await markAllRead(userId); // idempotent no-op, just exercising the direct service path too
  });
});
