import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";

const app = createApp();
let token: string;
let email: string;
const password = "password123";

function auth(t: string) {
  return { Authorization: `Bearer ${t}` };
}

beforeAll(async () => {
  email = `profile-test-${Date.now()}@example.com`;
  const registered = await request(app)
    .post("/api/register")
    .send({ displayName: "Profile Test", email, password });
  if (registered.status !== 200) {
    throw new Error(`Failed to register during test setup: ${registered.status} ${JSON.stringify(registered.body)}`);
  }
  // SMTP isn't configured in tests, so registration signs in immediately (no verification step).
  token = registered.body.token;
});

describe("PATCH /profile", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).patch("/api/profile").send({ current_password: password, new_password: "newpassword123" });
    expect(res.status).toBe(401);
  });

  it("rejects a request with no current_password", async () => {
    const res = await request(app).patch("/api/profile").set(auth(token)).send({ new_password: "newpassword123" });
    expect(res.status).toBe(400);
  });

  it("rejects a request that changes nothing", async () => {
    const res = await request(app).patch("/api/profile").set(auth(token)).send({ current_password: password });
    expect(res.status).toBe(400);
  });

  it("rejects the wrong current password without forcing a logout (403, not 401)", async () => {
    const res = await request(app)
      .patch("/api/profile")
      .set(auth(token))
      .send({ current_password: "totally-wrong", new_password: "newpassword123" });
    expect(res.status).toBe(403);
  });

  it("changes the password with the correct current password, and the new password logs in", async () => {
    const newPassword = "newpassword456";
    const res = await request(app)
      .patch("/api/profile")
      .set(auth(token))
      .send({ current_password: password, new_password: newPassword });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);

    const loginOld = await request(app).post("/api/login").send({ email, password });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post("/api/login").send({ email, password: newPassword });
    expect(loginNew.status).toBe(200);
    token = loginNew.body.token;
  });

  it("applies an email change immediately when SMTP isn't configured (no pending_email)", async () => {
    const newEmail = `profile-test-changed-${Date.now()}@example.com`;
    const res = await request(app)
      .patch("/api/profile")
      .set(auth(token))
      .send({ current_password: "newpassword456", email: newEmail });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(newEmail);
    expect(res.body.user.pending_email).toBeNull();
    email = newEmail;
  });

  it("rejects changing to an email already used by another account", async () => {
    const otherEmail = `profile-test-other-${Date.now()}@example.com`;
    await request(app).post("/api/register").send({ displayName: "Other", email: otherEmail, password });

    const res = await request(app)
      .patch("/api/profile")
      .set(auth(token))
      .send({ current_password: "newpassword456", email: otherEmail });
    expect(res.status).toBe(409);
  });
});
