import { describe, expect, it } from 'vitest';
import { pinchGeometry, pinchView, zoomAt } from './view-gestures';

describe('view gestures', () => {
  it('measures a two-finger gesture', () => {
    expect(
      pinchGeometry([
        { x: 100, y: 120 },
        { x: 300, y: 220 },
      ]),
    ).toEqual({
      distance: Math.hypot(200, 100),
      midpoint: { x: 200, y: 170 },
    });
  });

  it('keeps the point under the zoom center stationary', () => {
    const startingView = { scale: 1, offset: { x: 20, y: -10 } };
    const center = { x: 240, y: 180 };
    const worldPoint = {
      x: (center.x - startingView.offset.x) / startingView.scale,
      y: (center.y - startingView.offset.y) / startingView.scale,
    };
    const zoomed = zoomAt(startingView, center.x, center.y, 2);

    expect(zoomed.scale).toBe(2);
    expect(zoomed.offset.x + worldPoint.x * zoomed.scale).toBeCloseTo(center.x);
    expect(zoomed.offset.y + worldPoint.y * zoomed.scale).toBeCloseTo(center.y);
  });

  it('zooms and pans with the moving pinch midpoint', () => {
    const result = pinchView(
      { scale: 1, offset: { x: 0, y: 0 } },
      { distance: 100, midpoint: { x: 200, y: 200 } },
      { distance: 200, midpoint: { x: 230, y: 240 } },
    );

    expect(result).toEqual({ scale: 2, offset: { x: -170, y: -160 } });
  });

  it('respects the viewer zoom limits', () => {
    expect(zoomAt({ scale: 4, offset: { x: 0, y: 0 } }, 0, 0, 10).scale).toBe(8);
    expect(zoomAt({ scale: 0.2, offset: { x: 0, y: 0 } }, 0, 0, 0.01).scale).toBe(0.1);
  });
});
