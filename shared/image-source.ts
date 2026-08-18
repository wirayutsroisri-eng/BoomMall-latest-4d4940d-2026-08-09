/** Decide whether to show a camera vs gallery chooser. */
export function shouldOfferCameraCapture(input: {
  maxTouchPoints?: number;
  pointerCoarse?: boolean;
}): boolean {
  return Boolean(input.pointerCoarse) || (input.maxTouchPoints ?? 0) > 0;
}
