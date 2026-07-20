import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUserCtx(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    avatar: null,
    phone: null,
    kycStatus: "approved",
    kycProvider: "google",
    kycSocialId: "google-123",
    kycSocialName: "Test User",
    kycSocialEmail: "test@example.com",
    kycSubmittedAt: new Date(),
    kycReviewedAt: new Date(),
    kycReviewNote: null,
    isSeller: true,
    sellerFeeRate: "7.00",
    bankAccountName: null,
    bankAccountNumber: null,
    bankName: null,
    promptpayNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createAdminCtx(): TrpcContext {
  return createUserCtx({ id: 99, openId: "admin-user", role: "admin" });
}

describe("auth.me", () => {
  it("returns user when authenticated", async () => {
    const ctx = createUserCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result?.id).toBe(1);
    expect(result?.name).toBe("Test User");
  });

  it("returns null when not authenticated", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });
});

describe("kyc.getStatus", () => {
  it("returns KYC status for authenticated user", async () => {
    const ctx = createUserCtx({ kycStatus: "approved" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.kyc.getStatus();
    expect(result.kycStatus).toBe("approved");
    expect(result.isSeller).toBe(true);
  });

  it("returns pending KYC status", async () => {
    const ctx = createUserCtx({ kycStatus: "pending", isSeller: false });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.kyc.getStatus();
    expect(result.kycStatus).toBe("pending");
    expect(result.isSeller).toBe(false);
  });
});

describe("admin procedures", () => {
  it("admin can access stats", async () => {
    const ctx = createAdminCtx();
    const caller = appRouter.createCaller(ctx);
    // stats calls DB which isn't available in test, but should not throw FORBIDDEN
    try {
      await caller.admin.stats();
    } catch (err: any) {
      expect(err.code).not.toBe("FORBIDDEN");
    }
  });

  it("non-admin cannot access admin stats", async () => {
    const ctx = createUserCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.admin.stats()).rejects.toThrow();
  });
});

describe("auth.logout", () => {
  it("clears cookie and returns success", async () => {
    const clearedCookies: string[] = [];
    const ctx: TrpcContext = {
      user: createUserCtx().user,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {
        clearCookie: (name: string) => clearedCookies.push(name),
      } as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
    expect(clearedCookies.length).toBe(1);
  });
});
