import { describe, it, expect } from "vitest";

// ─── Tracking URL helpers (mirrored from orders.ts) ──────────────────────────
const TRACKING_URLS: Record<string, (t: string) => string> = {
  kerry: (t) => `https://th.kerryexpress.com/th/track/?track=${t}`,
  flash: (t) => `https://www.flashexpress.co.th/tracking/?se=${t}`,
  jnt: (t) => `https://www.jtexpress.co.th/index/query/gzquery.html?bills=${t}`,
  thailand_post: (t) => `https://track.thailandpost.co.th/?trackNumber=${t}`,
  dhl: (t) => `https://www.dhl.com/th-th/home/tracking.html?tracking-id=${t}`,
  other: (t) => `https://www.17track.net/th/track#nums=${t}`,
};

const PROVIDER_LABELS: Record<string, string> = {
  kerry: "Kerry Express",
  flash: "Flash Express",
  jnt: "J&T Express",
  thailand_post: "ไปรษณีย์ไทย",
  dhl: "DHL",
  other: "อื่นๆ",
};

function getTrackingUrl(trackingNumber: string | null, provider: string | null): string | null {
  if (!trackingNumber) return null;
  if (provider && TRACKING_URLS[provider]) {
    return TRACKING_URLS[provider](trackingNumber);
  }
  return TRACKING_URLS.other(trackingNumber);
}

function getProviderLabel(provider: string | null): string | null {
  if (!provider) return null;
  return PROVIDER_LABELS[provider] ?? provider;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Tracking URL mapping", () => {
  it("returns null when trackingNumber is null", () => {
    expect(getTrackingUrl(null, "kerry")).toBeNull();
    expect(getTrackingUrl(null, null)).toBeNull();
  });

  it("returns Kerry URL for kerry provider", () => {
    const url = getTrackingUrl("TH123456789", "kerry");
    expect(url).toBe("https://th.kerryexpress.com/th/track/?track=TH123456789");
  });

  it("returns Flash URL for flash provider", () => {
    const url = getTrackingUrl("FL987654321", "flash");
    expect(url).toBe("https://www.flashexpress.co.th/tracking/?se=FL987654321");
  });

  it("returns J&T URL for jnt provider", () => {
    const url = getTrackingUrl("JT111222333", "jnt");
    expect(url).toBe("https://www.jtexpress.co.th/index/query/gzquery.html?bills=JT111222333");
  });

  it("returns Thailand Post URL for thailand_post provider", () => {
    const url = getTrackingUrl("EH123456789TH", "thailand_post");
    expect(url).toBe("https://track.thailandpost.co.th/?trackNumber=EH123456789TH");
  });

  it("returns DHL URL for dhl provider", () => {
    const url = getTrackingUrl("1234567890", "dhl");
    expect(url).toBe("https://www.dhl.com/th-th/home/tracking.html?tracking-id=1234567890");
  });

  it("falls back to 17track for unknown provider", () => {
    const url = getTrackingUrl("UNKNOWN123", "lalamove");
    expect(url).toBe("https://www.17track.net/th/track#nums=UNKNOWN123");
  });

  it("falls back to 17track when provider is null", () => {
    const url = getTrackingUrl("NOCARRIER999", null);
    expect(url).toBe("https://www.17track.net/th/track#nums=NOCARRIER999");
  });

  it("falls back to 17track for other provider", () => {
    const url = getTrackingUrl("OTHER123", "other");
    expect(url).toBe("https://www.17track.net/th/track#nums=OTHER123");
  });
});

describe("Provider label mapping", () => {
  it("returns null for null provider", () => {
    expect(getProviderLabel(null)).toBeNull();
  });

  it("returns correct label for known providers", () => {
    expect(getProviderLabel("kerry")).toBe("Kerry Express");
    expect(getProviderLabel("flash")).toBe("Flash Express");
    expect(getProviderLabel("jnt")).toBe("J&T Express");
    expect(getProviderLabel("thailand_post")).toBe("ไปรษณีย์ไทย");
    expect(getProviderLabel("dhl")).toBe("DHL");
    expect(getProviderLabel("other")).toBe("อื่นๆ");
  });

  it("returns provider key as-is for unknown provider", () => {
    expect(getProviderLabel("lalamove")).toBe("lalamove");
  });
});
