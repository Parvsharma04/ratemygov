import { getDb, type DatabaseEnv } from './db';
import { pct } from './cache';

export const MIN_WINDOW_RESPONSES = 10;

/** Minimum days of snapshot history before the /trends page shows results. */
export const MIN_SNAPSHOT_DAYS = 7;

/** Day windows accepted on the /trends page (`?window=`). */
export const TREND_WINDOWS = [7, 30] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

export interface DailyPoint {
  day: string;
  satPct: number;
}

export interface WindowSentiment {
  stateCode: number;
  newSat: number;
  newDis: number;
  share: number | null;
}

export interface TrendRow {
  code: number;
  slug: string;
  name: string;
  allTimePct: number | null;
  windowPct: number | null;
  change: number | null;
  windowTotal: number;
}

/**
 * Parses the `?window=` query parameter against a strict whitelist.
 * - `7` and `30` are accepted.
 * - A missing parameter defaults to the 7-day window without redirecting
 *   (so `/trends` is a real page for footer links and the sitemap).
 * - Any other provided value redirects to the 7-day default.
 */
export function normalizeTrendWindow(
  raw: string | null
): { days: TrendWindow; redirect: boolean } {
  if (raw === '30') return { days: 30, redirect: false };
  if (raw === '7') return { days: 7, redirect: false };
  return { days: 7, redirect: raw !== null };
}

/**
 * Builds the /trends comparison table rows and sorts them by absolute change
 * (window % satisfied minus all-time % satisfied), largest first. States
 * without a computable change are placed last.
 */
export function buildTrendRows(
  states: readonly { code: number; slug: string; name: string }[],
  allTotals: Array<{
    stateCode: number;
    satisfied: number;
    dissatisfied: number;
  }>,
  sentiment: Map<number, WindowSentiment | null>
): TrendRow[] {
  const totalsByCode = new Map(allTotals.map((t) => [t.stateCode, t]));

  const rows: TrendRow[] = states.map((state) => {
    const totals = totalsByCode.get(state.code);
    const allTime = totals ? pct(totals.satisfied, totals.dissatisfied) : null;
    const windowData = sentiment.get(state.code) ?? null;

    const allTimePct = allTime ? allTime.satisfied : null;
    const windowPct = windowData?.share ?? null;
    const change =
      allTimePct !== null && windowPct !== null
        ? windowPct - allTimePct
        : null;

    return {
      code: state.code,
      slug: state.slug,
      name: state.name,
      allTimePct,
      windowPct,
      change,
      windowTotal: windowData ? windowData.newSat + windowData.newDis : 0,
    };
  });

  rows.sort((a, b) => {
    const aKey = a.change === null ? -1 : Math.abs(a.change);
    const bKey = b.change === null ? -1 : Math.abs(b.change);
    return bKey - aKey;
  });

  return rows;
}

/**
 * Returns up to `days` daily satisfaction percentages computed from the
 * *differences* between consecutive snapshots. Days where the total new
 * votes (deltaSat + deltaDis) is below 10 are skipped.
 *
 * The snapshots table stores cumulative totals, so day-over-day deltas
 * represent the new votes recorded on that calendar day.
 */
export async function getStateSeries(
  env: DatabaseEnv,
  stateCode: number,
  days: number = 30
): Promise<DailyPoint[]> {
  const { results: descendingRows } = await getDb(env)
    .prepare(
      `SELECT day, satisfied, dissatisfied
       FROM daily_snapshots
       WHERE state_code = ?
       ORDER BY day DESC
       LIMIT ?`
    )
    .bind(stateCode, Math.max(1, days + 1))
    .all<{ day: string; satisfied: number; dissatisfied: number }>();

  const rows = descendingRows.reverse();
  if (rows.length < 2) return [];

  const points: DailyPoint[] = [];

  for (let i = 1; i < rows.length; i++) {
    const sat = Number(rows[i].satisfied) - Number(rows[i - 1].satisfied);
    const dis = Number(rows[i].dissatisfied) - Number(rows[i - 1].dissatisfied);
    const total = sat + dis;

    if (total < MIN_WINDOW_RESPONSES) continue;

    points.push({
      day: String(rows[i].day).slice(0, 10),
      satPct: Math.round((sat / total) * 100),
    });
  }

  return points.slice(-days);
}

/**
 * For every state, computes the new satisfied and dissatisfied votes
 * since the latest snapshot that is at least `days` days old, compared
 * with live totals from vote_counts.
 *
 * Returns null for states where fewer than `days` days of snapshot
 * history exist. Sets `share` to null when the total new votes
 * (newSat + newDis) is below MIN_WINDOW_RESPONSES.
 */
export async function getWindowSentiment(
  env: DatabaseEnv,
  days: number
): Promise<Map<number, WindowSentiment | null>> {
  const db = getDb(env);
  const baseRows = await db
    .prepare(
      `SELECT snapshot.state_code, snapshot.satisfied, snapshot.dissatisfied
       FROM daily_snapshots AS snapshot
       WHERE snapshot.day = (
         SELECT MAX(previous.day)
         FROM daily_snapshots AS previous
         WHERE previous.state_code = snapshot.state_code
           AND previous.day <= date('now', '-' || ? || ' days')
       )
       ORDER BY snapshot.state_code`
    )
    .bind(days)
    .all<{ state_code: number; satisfied: number; dissatisfied: number }>();

  const liveRows = await db
    .prepare(
      `SELECT
         state_code,
         COALESCE(SUM(satisfied), 0) AS satisfied,
         COALESCE(SUM(dissatisfied), 0) AS dissatisfied
       FROM vote_counts
       GROUP BY state_code
       ORDER BY state_code`
    )
    .all<{ state_code: number; satisfied: number; dissatisfied: number }>();

  const baseMap = new Map<number, { sat: number; dis: number }>();
  for (const row of baseRows.results) {
    baseMap.set(Number(row.state_code), {
      sat: Number(row.satisfied),
      dis: Number(row.dissatisfied),
    });
  }

  const result = new Map<number, WindowSentiment | null>();

  for (const row of liveRows.results) {
    const sc = Number(row.state_code);
    const base = baseMap.get(sc);

    if (!base) {
      result.set(sc, null);
      continue;
    }

    const newSat = Number(row.satisfied) - base.sat;
    const newDis = Number(row.dissatisfied) - base.dis;
    const total = newSat + newDis;

    result.set(sc, {
      stateCode: sc,
      newSat,
      newDis,
      share: total >= MIN_WINDOW_RESPONSES ? Math.round((newSat / total) * 100) : null,
    });
  }

  return result;
}

/**
 * Returns the number of daily snapshots available for a state.
 */
export async function getSnapshotCount(
  env: DatabaseEnv,
  stateCode: number
): Promise<number> {
  const row = await getDb(env)
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM daily_snapshots
       WHERE state_code = ?`
    )
    .bind(stateCode)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}

/**
 * Returns the number of distinct snapshot days across all states (global
 * history available for the /trends window).
 */
export async function getSnapshotDayCount(env: DatabaseEnv): Promise<number> {
  const row = await getDb(env)
    .prepare(`SELECT COUNT(DISTINCT day) AS cnt FROM daily_snapshots`)
    .first<{ cnt: number }>();
  return Number(row?.cnt ?? 0);
}
