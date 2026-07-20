import { describe, it, expect, vi } from "vitest";

// Mock web-push
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }),
  },
}));

// Mock ./db — factory is hoisted by vitest, so makeDbMock must live inside it
vi.mock("./db", () => {
  function makeDbMock() {
    const db: any = {};
    db.select = () => db;
    db.from = () => db;
    // .where() returns a Promise<[]> that also has .limit() attached
    const whereResult: any = Promise.resolve([]);
    whereResult.limit = () => Promise.resolve([]);
    db.where = () => whereResult;
    db.limit = () => Promise.resolve([]);
    db.insert = () => db;
    db.values = () => Promise.resolve(undefined);
    db.update = () => db;
    const setResult: any = {};
    setResult.where = () => Promise.resolve(undefined);
    db.set = () => setResult;
    return db;
  }
  return { getDb: makeDbMock };
});

// Set env vars before importing webPush
process.env.VAPID_PUBLIC_KEY =
  "BEq-qeMaNkJkkSPZb2LTRXmMA5NGZjCFLJ2aYtPc3NFnSZLY2HQz7XAVUpC22p5z0b14Px8p9TRul4PYFnelHUg";
process.env.VAPID_PRIVATE_KEY = "X8yJHSTP90PRejF84NsSSVZWxbantqwSWPhuxlpLJh8";

import * as webPushModule from "./webPush";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("webPush VAPID configuration", () => {
  it("VAPID_PUBLIC_KEY has correct URL-safe base64 format", () => {
    const key = process.env.VAPID_PUBLIC_KEY!;
    expect(key).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(key.length).toBeGreaterThan(80);
  });

  it("VAPID_PRIVATE_KEY has correct URL-safe base64 format", () => {
    const key = process.env.VAPID_PRIVATE_KEY!;
    expect(key).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(key.length).toBeGreaterThan(30);
  });
});

describe("webPush functions", () => {
  it("saveWebPushSubscription resolves without error", async () => {
    await expect(
      webPushModule.saveWebPushSubscription(1, {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: { p256dh: "p256dh-key", auth: "auth-key" },
      })
    ).resolves.toBeUndefined();
  });

  it("removeWebPushSubscription resolves without error", async () => {
    await expect(
      webPushModule.removeWebPushSubscription(1, "https://fcm.googleapis.com/fcm/send/abc123")
    ).resolves.toBeUndefined();
  });

  it("sendWebPush resolves without error when no subscriptions exist", async () => {
    await expect(
      webPushModule.sendWebPush(999, { title: "Test", body: "Body", url: "/test" })
    ).resolves.toBeUndefined();
  });

  it("pushNewMessage resolves without error", async () => {
    await expect(
      webPushModule.pushNewMessage(1, "สมชาย", "ข้อความทดสอบ")
    ).resolves.toBeUndefined();
  });

  it("pushOrderStatusChange resolves without error", async () => {
    await expect(
      webPushModule.pushOrderStatusChange(1, 42, "shipped")
    ).resolves.toBeUndefined();
  });

  it("pushProductSold resolves without error", async () => {
    await expect(
      webPushModule.pushProductSold(1, "iPhone 15 Pro", 100)
    ).resolves.toBeUndefined();
  });

  it("pushNewCodOrder resolves without error", async () => {
    await expect(
      webPushModule.pushNewCodOrder(1, "มอเตอร์ 10kw", "สมชาย")
    ).resolves.toBeUndefined();
  });
});
