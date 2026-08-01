const MAX_CANVAS_DIMENSION = 8192;
const MAX_CANVAS_PIXELS = 16_777_216;

export function cappedRasterScale(width: number, height: number, requestedScale: number) {
  if (width <= 0 || height <= 0 || requestedScale <= 0) return 1;
  const dimensionScale = MAX_CANVAS_DIMENSION / Math.max(width, height);
  const pixelScale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  return Math.min(requestedScale, dimensionScale, pixelScale);
}
