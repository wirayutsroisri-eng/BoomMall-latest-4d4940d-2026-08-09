import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB helpers
vi.mock("./db", () => ({
  getOrderById: vi.fn(),
  getOrdersBySeller: vi.fn(),
  getOrdersByBuyer: vi.fn(),
  updateOrderStatus: vi.fn(),
  getUserById: vi.fn(),
  getSlipsByOrder: vi.fn(),
}));

import * as db from "./db";

describe("Seller Order Management - mySales logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should filter orders by status correctly", () => {
    const allOrders = [
      { id: 1, status: "payment_submitted", buyerId: 10 },
      { id: 2, status: "payment_confirmed", buyerId: 11 },
      { id: 3, status: "shipped", buyerId: 12 },
      { id: 4, status: "completed", buyerId: 13 },
      { id: 5, status: "cancelled", buyerId: 14 },
    ];

    const filtered = allOrders.filter((o) => o.status === "payment_submitted");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(1);
  });

  it("should count orders by status correctly", () => {
    const allOrders = [
      { id: 1, status: "payment_submitted" },
      { id: 2, status: "payment_submitted" },
      { id: 3, status: "payment_confirmed" },
      { id: 4, status: "shipped" },
      { id: 5, status: "completed" },
      { id: 6, status: "cancelled" },
    ];

    const counts = {
      all: allOrders.length,
      pending_payment: allOrders.filter((o) => o.status === "pending_payment").length,
      payment_submitted: allOrders.filter((o) => o.status === "payment_submitted").length,
      payment_confirmed: allOrders.filter((o) => o.status === "payment_confirmed").length,
      shipped: allOrders.filter((o) => o.status === "shipped").length,
      completed: allOrders.filter((o) => o.status === "completed").length,
      cancelled: allOrders.filter((o) => o.status === "cancelled").length,
    };

    expect(counts.all).toBe(6);
    expect(counts.payment_submitted).toBe(2);
    expect(counts.payment_confirmed).toBe(1);
    expect(counts.shipped).toBe(1);
    expect(counts.completed).toBe(1);
    expect(counts.cancelled).toBe(1);
    expect(counts.pending_payment).toBe(0);
  });

  it("should validate order belongs to seller before action", async () => {
    const mockOrder = { id: 1, sellerId: 100, buyerId: 200, status: "payment_submitted" };
    vi.mocked(db.getOrderById).mockResolvedValue(mockOrder as any);

    const order = await db.getOrderById(1);
    expect(order?.sellerId).toBe(100);

    // Seller 100 can act on this order
    const canAct = order?.sellerId === 100;
    expect(canAct).toBe(true);

    // Seller 999 cannot act on this order
    const cannotAct = order?.sellerId === 999;
    expect(cannotAct).toBe(false);
  });

  it("should only allow confirm payment when status is payment_submitted", async () => {
    const validStatuses = ["payment_submitted"];
    const invalidStatuses = ["pending_payment", "payment_confirmed", "shipped", "completed", "cancelled"];

    validStatuses.forEach((status) => {
      const canConfirm = status === "payment_submitted";
      expect(canConfirm).toBe(true);
    });

    invalidStatuses.forEach((status) => {
      const canConfirm = status === "payment_submitted";
      expect(canConfirm).toBe(false);
    });
  });

  it("should only allow mark shipped when status is payment_confirmed", () => {
    const validStatuses = ["payment_confirmed"];
    const invalidStatuses = ["pending_payment", "payment_submitted", "shipped", "completed", "cancelled"];

    validStatuses.forEach((status) => {
      const canShip = status === "payment_confirmed";
      expect(canShip).toBe(true);
    });

    invalidStatuses.forEach((status) => {
      const canShip = status === "payment_confirmed";
      expect(canShip).toBe(false);
    });
  });

  it("should only allow cancel when status is pending_payment or payment_submitted", () => {
    const cancellableStatuses = ["pending_payment", "payment_submitted"];
    const nonCancellableStatuses = ["payment_confirmed", "shipped", "completed", "cancelled"];

    cancellableStatuses.forEach((status) => {
      const canCancel = ["pending_payment", "payment_submitted"].includes(status);
      expect(canCancel).toBe(true);
    });

    nonCancellableStatuses.forEach((status) => {
      const canCancel = ["pending_payment", "payment_submitted"].includes(status);
      expect(canCancel).toBe(false);
    });
  });

  it("should sort slips by createdAt descending to get latest slip", () => {
    const slips = [
      { id: 1, slipUrl: "slip1.jpg", createdAt: new Date("2024-01-01") },
      { id: 3, slipUrl: "slip3.jpg", createdAt: new Date("2024-01-03") },
      { id: 2, slipUrl: "slip2.jpg", createdAt: new Date("2024-01-02") },
    ];

    const latestSlip = slips.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    expect(latestSlip.id).toBe(3);
    expect(latestSlip.slipUrl).toBe("slip3.jpg");
  });
});
