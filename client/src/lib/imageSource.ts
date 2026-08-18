import { shouldOfferCameraCapture } from "@shared/image-source";

export function deviceOffersCameraCapture(): boolean {
  if (typeof window === "undefined") return false;
  return shouldOfferCameraCapture({
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    pointerCoarse: window.matchMedia?.("(pointer: coarse)")?.matches ?? false,
  });
}
