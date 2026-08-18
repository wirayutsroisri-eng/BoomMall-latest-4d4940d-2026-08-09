import { describe, expect, it } from "vitest";
import { shouldOfferCameraCapture } from "@shared/image-source";

describe("shouldOfferCameraCapture", () => {
  it("offers camera on touch phones", () => {
    expect(
      shouldOfferCameraCapture({ maxTouchPoints: 5, pointerCoarse: true })
    ).toBe(true);
  });

  it("offers camera when only coarse pointer is reported", () => {
    expect(
      shouldOfferCameraCapture({ maxTouchPoints: 0, pointerCoarse: true })
    ).toBe(true);
  });

  it("skips the chooser on desktop mouse input", () => {
    expect(
      shouldOfferCameraCapture({ maxTouchPoints: 0, pointerCoarse: false })
    ).toBe(false);
  });
});
