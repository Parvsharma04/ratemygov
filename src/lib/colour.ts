/**
 * Diverging choropleth colour scale for Rate My Gov.
 *
 * Requirements:
 * - 5 steps of blue for satisfied majority (>50% to 100%)
 * - 5 steps of red for dissatisfied majority (0% to <50%)
 * - Near-neutral light grey-white at exactly 50%
 * - States with fewer than MIN_RESPONSES get neutral grey hatch pattern (never a colour)
 * - Fixed palette with contrast verification for borders
 */

export const MIN_RESPONSES = 50;

export const COLOR_SCALE = {
  // 5 steps of red: from strongest dissatisfaction to lightest
  REDS: [
    '#991b1b', // 0% - 9% (strongest dissatisfied)
    '#dc2626', // 10% - 19%
    '#ef4444', // 20% - 29%
    '#f87171', // 30% - 39%
    '#fca5a5', // 40% - 49% (lightest dissatisfied)
  ] as const,

  // Exactly 50% neutral
  NEUTRAL: '#f1f5f9',

  // 5 steps of blue: from lightest satisfaction to strongest
  BLUES: [
    '#93c5fd', // 51% - 60% (lightest satisfied)
    '#60a5fa', // 61% - 70%
    '#3b82f6', // 71% - 80%
    '#2563eb', // 81% - 90%
    '#1e40af', // 91% - 100% (strongest satisfied)
  ] as const,

  // Insufficient responses / low-sample fallback
  HATCH_FILL: 'url(#hatch)',
  HATCH_BG: '#e2e8f0',
  HATCH_STROKE: '#94a3b8',

  // Border color for map state boundaries
  BORDER: '#ffffff',
} as const;

/**
 * Returns the relative luminance of an RGB/Hex colour per WCAG 2.1.
 */
export function getLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Returns the WCAG contrast ratio between two hex colours.
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Computes the fill colour or hatch pattern URL for a state.
 *
 * @param share - Satisfaction percentage (0-100) or null if uncomputed
 * @param totalResponses - Total responses recorded for the state
 * @param minResponses - Minimum required responses threshold (defaults to MIN_RESPONSES)
 */
export function getMapColor(
  share: number | null,
  totalResponses?: number,
  minResponses: number = MIN_RESPONSES
): string {
  if (share === null) {
    return COLOR_SCALE.HATCH_FILL;
  }

  if (totalResponses !== undefined && totalResponses < minResponses) {
    return COLOR_SCALE.HATCH_FILL;
  }

  if (share === 50) {
    return COLOR_SCALE.NEUTRAL;
  }

  if (share < 50) {
    if (share < 10) return COLOR_SCALE.REDS[0];
    if (share < 20) return COLOR_SCALE.REDS[1];
    if (share < 30) return COLOR_SCALE.REDS[2];
    if (share < 40) return COLOR_SCALE.REDS[3];
    return COLOR_SCALE.REDS[4];
  }

  // share > 50
  if (share <= 60) return COLOR_SCALE.BLUES[0];
  if (share <= 70) return COLOR_SCALE.BLUES[1];
  if (share <= 80) return COLOR_SCALE.BLUES[2];
  if (share <= 90) return COLOR_SCALE.BLUES[3];
  return COLOR_SCALE.BLUES[4];
}
