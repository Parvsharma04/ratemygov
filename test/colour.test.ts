import { describe, it, expect } from 'vitest';
import {
  getMapColor,
  COLOR_SCALE,
  MIN_RESPONSES,
  getContrastRatio,
} from '../src/lib/colour';

describe('Map colour scale', () => {
  it('returns strongest red for 0% satisfied (strongest dissatisfaction)', () => {
    const color = getMapColor(0);
    expect(color).toBe(COLOR_SCALE.REDS[0]); // #991b1b
  });

  it('returns lightest red for 49% satisfied', () => {
    const color = getMapColor(49);
    expect(color).toBe(COLOR_SCALE.REDS[4]); // #fca5a5
  });

  it('returns near-neutral light grey-white for exactly 50%', () => {
    const color = getMapColor(50);
    expect(color).toBe(COLOR_SCALE.NEUTRAL); // #f1f5f9
  });

  it('returns lightest blue for 51% satisfied', () => {
    const color = getMapColor(51);
    expect(color).toBe(COLOR_SCALE.BLUES[0]); // #93c5fd
  });

  it('returns strongest blue for 100% satisfied (strongest satisfaction)', () => {
    const color = getMapColor(100);
    expect(color).toBe(COLOR_SCALE.BLUES[4]); // #1e40af
  });

  it('returns hatch pattern url for null', () => {
    const color = getMapColor(null);
    expect(color).toBe(COLOR_SCALE.HATCH_FILL); // url(#hatch)
  });

  it('returns hatch pattern for states with fewer than MIN_RESPONSES responses', () => {
    // Even if satisfied share is 80%, low responses gets hatch pattern, never a colour
    expect(getMapColor(80, MIN_RESPONSES - 1)).toBe(COLOR_SCALE.HATCH_FILL);
    expect(getMapColor(80, 0)).toBe(COLOR_SCALE.HATCH_FILL);

    // Meets or exceeds threshold gets the calculated colour
    expect(getMapColor(80, MIN_RESPONSES)).toBe(COLOR_SCALE.BLUES[2]);
  });

  it('verifies contrast of state borders against palette fills', () => {
    // Border is white #ffffff
    // Verify contrast against all dark and medium steps
    const highContrastFills = [
      COLOR_SCALE.REDS[0], // #991b1b
      COLOR_SCALE.REDS[1], // #dc2626
      COLOR_SCALE.REDS[2], // #ef4444
      COLOR_SCALE.BLUES[2], // #3b82f6
      COLOR_SCALE.BLUES[3], // #2563eb
      COLOR_SCALE.BLUES[4], // #1e40af
    ];

    for (const fill of highContrastFills) {
      const contrast = getContrastRatio(COLOR_SCALE.BORDER, fill);
      expect(contrast).toBeGreaterThanOrEqual(3.0);
    }
  });
});
