import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

const app = createApp();
let adminToken: string;
let memberToken: string;
let memberUserId: string;

function tmpFile(name: string, contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "printstash-test-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, contents);
  return p;
}

beforeAll(async () => {
  const adminEmail = `admin-test-${Date.now()}@example.com`;
  const adminRegister = await request(app)
    .post("/api/register")
    .send({ displayName: "Admin Test", email: adminEmail, password: "password123" });
  if (adminRegister.status !== 200) {
    throw new Error(`Failed to register admin during test setup: ${adminRegister.status} ${JSON.stringify(adminRegister.body)}`);
  }
  await prisma.user.update({ where: { id: adminRegister.body.user.id }, data: { role: "ADMIN" } });
  // Tokens embed the role at issue time, so a promoted account needs a fresh login to pick it up.
  const adminLogin = await request(app).post("/api/login").send({ email: adminEmail, password: "password123" });
  adminToken = adminLogin.body.token;

  const memberEmail = `member-test-${Date.now()}@example.com`;
  const memberRegister = await request(app)
    .post("/api/register")
    .send({ displayName: "Member Test", email: memberEmail, password: "password123" });
  memberToken = memberRegister.body.token;
  memberUserId = memberRegister.body.user.id;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("admin user management", () => {
  it("rejects a non-admin from listing users", async () => {
    const res = await request(app).get("/api/admin/users").set(auth(memberToken));
    expect(res.status).toBe(403);
  });

  it("rejects a non-admin from triggering a deletion", async () => {
    const res = await request(app).post(`/api/admin/users/${memberUserId}/delete-all-prints`).set(auth(memberToken));
    expect(res.status).toBe(403);
  });

  it("lists users with their print counts", async () => {
    await request(app)
      .post("/api/upload")
      .set(auth(memberToken))
      .attach("files", tmpFile("admin-test-a.stl", "solid a endsolid"));
    await request(app)
      .post("/api/upload")
      .set(auth(memberToken))
      .attach("files", tmpFile("admin-test-b.stl", "solid b endsolid"));

    const res = await request(app).get("/api/admin/users").set(auth(adminToken));
    expect(res.status).toBe(200);
    const member = res.body.find((u: { id: string }) => u.id === memberUserId);
    expect(member).toBeTruthy();
    expect(member.print_count).toBe(2);
  });

  it("404s for deleting prints of a nonexistent user", async () => {
    const res = await request(app).post("/api/admin/users/does-not-exist/delete-all-prints").set(auth(adminToken));
    expect(res.status).toBe(404);
  });

  it("deletes every print belonging to the target user, leaving other users untouched", async () => {
    const deleteRes = await request(app)
      .post(`/api/admin/users/${memberUserId}/delete-all-prints`)
      .set(auth(adminToken));
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.deleted).toBe(2);

    const printsRes = await request(app).get("/api/prints").set(auth(memberToken));
    expect(printsRes.body).toEqual([]);

    const usersRes = await request(app).get("/api/admin/users").set(auth(adminToken));
    const member = usersRes.body.find((u: { id: string }) => u.id === memberUserId);
    expect(member.print_count).toBe(0);
  });
});
