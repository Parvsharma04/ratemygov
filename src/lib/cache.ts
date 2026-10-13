export const CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=300',
} as const;

export interface PctResult extends Iterable<number> {
  satisfied: number;
  dissatisfied: number;
  0: number;
  1: number;
}

/**
 * Calculates whole-number percentages that sum to exactly 100 using the
 * largest remainder method (Hamilton/Hare-Niemeyer method).
 *
 * Returns null when there are zero votes (or negative inputs).
 * Supports both object access (.satisfied, .dissatisfied) and array destructuring ([sat, dis]).
 */
export function pct(sat: number, dis: number): PctResult | null {
  if (sat < 0 || dis < 0) {
    return null;
  }

  const total = sat + dis;
  if (total <= 0) {
    return null;
  }

  const exactSat = (sat / total) * 100;
  const exactDis = (dis / total) * 100;

  let sFloor = Math.floor(exactSat);
  let dFloor = Math.floor(exactDis);

  const diff = 100 - (sFloor + dFloor);
  if (diff === 1) {
    const remSat = exactSat - sFloor;
    const remDis = exactDis - dFloor;
    if (remSat >= remDis) {
      sFloor += 1;
    } else {
      dFloor += 1;
    }
  }

  const result = {
    satisfied: sFloor,
    dissatisfied: dFloor,
  } as PctResult;

  Object.defineProperty(result, 0, { value: sFloor, enumerable: false });
  Object.defineProperty(result, 1, { value: dFloor, enumerable: false });
  Object.defineProperty(result, Symbol.iterator, {
    enumerable: false,
    value: function* () {
      yield sFloor;
      yield dFloor;
    },
  });

  return result;
}
