import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import {
  availableModelName,
  availablePlateFilename,
  samplePlateStoragePaths,
  uniqueModelName,
  validateStorageTemplate,
  DEFAULT_STORAGE_TEMPLATE,
} from "../src/services/printService";

describe("validateStorageTemplate", () => {
  it("accepts the default template", () => {
    expect(validateStorageTemplate(DEFAULT_STORAGE_TEMPLATE)).toBe(DEFAULT_STORAGE_TEMPLATE);
  });

  it("rejects a template missing {filename}", () => {
    expect(() => validateStorageTemplate("{folder}/{model}")).toThrow(/exactly once/);
  });

  it("rejects an unknown token", () => {
    expect(() => validateStorageTemplate("{folder}/{bogus}/{filename}")).toThrow(/Unknown storage token/);
  });

  it("rejects {filename} outside the final segment", () => {
    expect(() => validateStorageTemplate("{filename}/{model}")).toThrow(/final path segment/);
  });

  it("accepts the new {plate} token", () => {
    expect(validateStorageTemplate("{model}/plate-{plate}/{filename}")).toBe("{model}/plate-{plate}/{filename}");
  });
});

describe("samplePlateStoragePaths", () => {
  it("renders two sibling plate paths sharing the same model directory", () => {
    const [first, second] = samplePlateStoragePaths(DEFAULT_STORAGE_TEMPLATE);
    expect(first).not.toBe(second);
    const firstDir = first.split("/").slice(0, -1).join("/");
    const secondDir = second.split("/").slice(0, -1).join("/");
    expect(firstDir).toBe(secondDir);
  });
});

describe("print name + plate filename uniqueness (integration, real Postgres)", () => {
  const createdPrintIds: string[] = [];
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    const suffix = Date.now();
    const user = await prisma.user.create({
      data: {
        email: `printservice-test-${suffix}@example.com`,
        passwordHash: "unused-in-these-tests",
        displayName: "Print Service Test User",
      },
    });
    userId = user.id;
    const otherUser = await prisma.user.create({
      data: {
        email: `printservice-test-other-${suffix}@example.com`,
        passwordHash: "unused-in-these-tests",
        displayName: "Print Service Test User (other)",
      },
    });
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    if (createdPrintIds.length) {
      await prisma.print.deleteMany({ where: { id: { in: createdPrintIds } } });
    }
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("availableModelName auto-suffixes root-level collisions", async () => {
    const name = `Test Widget ${Date.now()}`;
    const first = await prisma.print.create({
      data: { userId, name, nameNormalized: name.toLowerCase(), tags: [] },
    });
    createdPrintIds.push(first.id);

    const nextName = await availableModelName(userId, name, null);
    expect(nextName).toBe(`${name} (2)`);
  });

  it("uniqueModelName throws 409 on an explicit collision", async () => {
    const name = `Test Gadget ${Date.now()}`;
    const first = await prisma.print.create({
      data: { userId, name, nameNormalized: name.toLowerCase(), tags: [] },
    });
    createdPrintIds.push(first.id);

    await expect(uniqueModelName(userId, name, null)).rejects.toMatchObject({ status: 409 });
  });

  it("the partial unique index rejects two root-level prints with the same name for the same user", async () => {
    const name = `Test Collision ${Date.now()}`;
    const first = await prisma.print.create({
      data: { userId, name, nameNormalized: name.toLowerCase(), tags: [] },
    });
    createdPrintIds.push(first.id);

    await expect(
      prisma.print.create({ data: { userId, name, nameNormalized: name.toLowerCase(), tags: [] } }),
    ).rejects.toThrow(/unique constraint/i);
  });

  it("the same name is allowed for two different users (uniqueness is per-user)", async () => {
    const name = `Test Cross-User ${Date.now()}`;
    const first = await prisma.print.create({
      data: { userId, name, nameNormalized: name.toLowerCase(), tags: [] },
    });
    createdPrintIds.push(first.id);

    const second = await prisma.print.create({
      data: { userId: otherUserId, name, nameNormalized: name.toLowerCase(), tags: [] },
    });
    createdPrintIds.push(second.id);

    expect(second.nameNormalized).toBe(first.nameNormalized);
  });

  it("availablePlateFilename auto-suffixes a duplicate filename within the same print", async () => {
    const name = `Test Multiplate ${Date.now()}`;
    const print = await prisma.print.create({
      data: { userId, name, nameNormalized: name.toLowerCase(), tags: [] },
    });
    createdPrintIds.push(print.id);
    await prisma.plate.create({
      data: {
        printId: print.id,
        position: 0,
        filename: "body.stl",
        mime: "model/stl",
        size: 100,
        storagePath: `test/${print.id}/body.stl`,
      },
    });

    const nextFilename = await availablePlateFilename(print.id, "body.stl");
    expect(nextFilename).toBe("body (2).stl");

    const untakenFilename = await availablePlateFilename(print.id, "lid.stl");
    expect(untakenFilename).toBe("lid.stl");
  });
});
