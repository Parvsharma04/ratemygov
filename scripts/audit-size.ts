/**
 * Build-time size and payload audit for Rate My Gov.
 *
 * Usage: pnpm audit:size [--skip-build]
 *
 * What it verifies against the real production build (served by `wrangler dev`):
 *  - Compressed (gzip) HTML per route against the per-route budget.
 *  - Inline CSS gzip <= 6 KB and total client JS gzip <= 3 KB on every page.
 *  - No render-blocking or external resources on first load:
 *    no <link rel="stylesheet">, no external scripts/images/media,
 *    no @font-face / web fonts, no static third-party script tags.
 *  - Cache-Control on every public GET route (pages, sitemap, /go redirect)
 *    and no-store on personalized/error/vote-processing responses.
 *
 * Pages are served in DB-fallback mode (`wrangler dev` cannot reach local
 * Postgres), so the biggest fixed payload — the inline Survey of India map on
 * the home page — is always measured (map paths are data-independent). The
 * data-dependent widgets on /trends and state pages are small and well inside
 * their budgets, so the fallback render still provides a strict guard.
 *
 * Exits non-zero when any budget is exceeded or a structural invariant is
 * violated, so `pnpm audit:size` fails the build in CI.
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const PROJECT_ROOT = fileURLToPath(new URL('..', import.meta.url));
const skipBuild = process.argv.includes('--skip-build');

const KIB = 1024;
const BUDGETS = {
  homeTrends: 45 * KIB, // / and /trends with inline map
  page: 15 * KIB, // every other page
  css: 6 * KIB,
  js: 3 * KIB,
};

const ROUTES = [
  { path: '/', label: '/', budget: BUDGETS.homeTrends },
  { path: '/trends', label: '/trends', budget: BUDGETS.homeTrends },
  { path: '/state/maharashtra', label: '/state/<slug>', budget: BUDGETS.page },
  { path: '/methodology', label: '/methodology', budget: BUDGETS.page },
  { path: '/privacy', label: '/privacy', budget: BUDGETS.page },
];

const PUBLIC_CACHE = 'public, s-maxage=30, stale-while-revalidate=300';

const HEADER_CHECKS: Array<{
  path: string;
  method?: 'GET' | 'POST';
  redirect?: 'follow' | 'manual';
  expectStatus: number;
  expectCache: string;
  /** Locally the DB is unreachable, so this endpoint may serve 5xx with
   *  no-store (never on success). Require: 200 -> public cache, 5xx -> no-store. */
  fallbackNoStoreOn5xx?: boolean;
}> = [
  { path: '/', expectStatus: 200, expectCache: PUBLIC_CACHE },
  { path: '/trends', expectStatus: 200, expectCache: PUBLIC_CACHE },
  { path: '/state/maharashtra', expectStatus: 200, expectCache: PUBLIC_CACHE },
  { path: '/methodology', expectStatus: 200, expectCache: PUBLIC_CACHE },
  { path: '/privacy', expectStatus: 200, expectCache: PUBLIC_CACHE },
  { path: '/sitemap.xml', expectStatus: 200, expectCache: PUBLIC_CACHE },
  {
    path: '/api/stats.json',
    expectStatus: 200,
    expectCache: PUBLIC_CACHE,
    fallbackNoStoreOn5xx: true,
  },
  {
    path: '/go?state=delhi',
    redirect: 'manual',
    expectStatus: 302,
    expectCache: PUBLIC_CACHE,
  },
  { path: '/state/atlantis', expectStatus: 404, expectCache: 'no-store' },
  { path: '/api/geo', expectStatus: 200, expectCache: 'private, no-store' },
  {
    path: '/api/vote',
    method: 'POST',
    expectStatus: 403,
    expectCache: 'no-store',
  },
];

const startTime = Date.now();

function runBuild() {
  if (skipBuild) {
    if (!existsSync(join(PROJECT_ROOT, 'dist', '_worker.js', 'index.js'))) {
      throw new Error(
        'No previous build found in dist/ and --skip-build was passed. Run `pnpm build` first.'
      );
    }
    return;
  }
  console.log('> Building production bundle...');
  execSync('pnpm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
}

async function main() {
  runBuild();

  const port = 8800 + Math.floor(Math.random() * 99);
  const wranglerBin = join(PROJECT_ROOT, 'node_modules', '.bin', 'wrangler');

  console.log(`> Starting wrangler dev (local) on port ${port}...`);
  const child = spawn(wranglerBin, ['dev', '--local', '--port', String(port)], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let wranglerOutput = '';
  child.stdout?.on('data', (d) => (wranglerOutput += d));
  child.stderr?.on('data', (d) => (wranglerOutput += d));
  const kill = () => {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already exited */
    }
  };
  process.on('exit', kill);

  let failed = false;
  const rows: string[] = [];

  try {
    await waitUntilReady(port, 90000, wranglerOutput);

    for (const route of ROUTES) {
      const html = await fetchText(port, route.path);
      const gzip = gzipSync(Buffer.from(html, 'utf8')).length;

      const styles = extractGroups(html, /<style[^>]*>([\s\S]*?)<\/style>/g);
      const cssGzip = gzipSync(Buffer.from(styles.join('\n'), 'utf8')).length;

      const inlineScripts = extractScriptBodies(html);
      const jsGzip = gzipSync(Buffer.from(inlineScripts.join('\n'), 'utf8')).length;

      const okHtml = gzip <= route.budget;
      const okCss = cssGzip <= BUDGETS.css;
      const okJs = jsGzip <= BUDGETS.js;

      const structural = checkStructure(html, styles.join('\n'));
      const okStructural = structural.length === 0;

      failed ||= !okHtml || !okCss || !okJs || !okStructural;

      rows.push(
        `  ${route.label.padEnd(18)} html ${fmt(gzip)}/${fmt(route.budget)} ${ok(okHtml)}` +
          `  css ${fmt(cssGzip)}/${fmt(BUDGETS.css)} ${ok(okCss)}` +
          `  js ${fmt(jsGzip)}/${fmt(BUDGETS.js)} ${ok(okJs)}` +
          (okStructural ? '' : `  STRUCTURAL: ${structural.join('; ')}`)
      );
    }

    for (const check of HEADER_CHECKS) {
      const res = await fetch(`http://127.0.0.1:${port}${check.path}`, {
        method: check.method ?? 'GET',
        redirect: check.redirect ?? 'follow',
        ...(check.method === 'POST'
          ? { headers: { 'content-type': 'application/json' }, body: '{}' }
          : {}),
      });
      const cc = res.headers.get('cache-control') ?? '';
      const expectedCache =
        check.fallbackNoStoreOn5xx && res.status >= 500 ? 'no-store' : check.expectCache;
      const okStatus =
        check.fallbackNoStoreOn5xx && res.status >= 500
          ? res.status >= 500 && res.status < 600
          : res.status === check.expectStatus;
      const okCache = cc.toLowerCase() === expectedCache.toLowerCase();
      failed ||= !okStatus || !okCache;
      rows.push(
        `  header ${check.method ?? 'GET'} ${check.path.padEnd(22)} status ${res.status} expected ${expectedCache === 'no-store' && check.fallbackNoStoreOn5xx ? '5xx (local DB fallback) / 200' : check.expectStatus} ${ok(okStatus)}  ` +
          `cache "${cc}" expected "${expectedCache}" ${ok(okCache)}`
      );
    }
  } finally {
    kill();
  }

  console.log('');
  console.log('Size and header audit (production build via wrangler dev):');
  rows.forEach((r) => console.log(r));

  const seconds = ((Date.now() - startTime) / 1000).toFixed(1);
  if (failed) {
    console.log(`\nAUDIT FAILED (${seconds}s). Budget or invariant violation.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAUDIT PASSED (${seconds}s). All size budgets and invariants hold.`);
  }
}

async function waitUntilReady(port: number, timeoutMs: number, out: string) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
      lastErr = `status ${res.status}`;
    } catch (e) {
      lastErr = String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(
    `wrangler dev did not become ready on port ${port} (${lastErr}).\n` +
      `--- wrangler output ---\n${out.slice(-2000)}`
  );
}

async function fetchText(port: number, path: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.text();
}

function extractGroups(html: string, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(re)) out.push(m[1]);
  return out;
}

function extractScriptBodies(html: string): string[] {
  // Only count inline scripts (no src) — bundled client modules are inlined in
  // the production output. Runtime-injected Turnstile is not present in HTML.
  return extractGroups(html, /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g);
}

/** Returns a list of structural violations found in the served HTML. */
function checkStructure(html: string, styles: string): string[] {
  const problems: string[] = [];

  // Render-blocking stylesheet linked externally.
  if (/<link[^>]+rel=["'][^"']*stylesheet/i.test(html)) {
    problems.push('external stylesheet');
  }

  // Third-party or static external scripts on first load (Turnstile must be
  // injected only at runtime after first interaction with the vote form).
  if (/<script[^>]+\bsrc=["']https?:\/\//i.test(html)) {
    problems.push('external <script src> on first load');
  }

  // Other resource types must not be present (no images/media/embedding).
  if (/<(img|iframe|video|audio|source|object|embed)[^>]*>/i.test(html)) {
    problems.push('img/media/embed element present');
  }

  // External links other than the canonical element.
  if (/<link(?![^>]*rel=["']canonical["'])[^>]+\bhref=["']https?:\/\//i.test(html)) {
    problems.push('external <link> besides canonical');
  }

  // Web fonts declared in inline CSS.
  if (/@font-face/i.test(styles)) {
    problems.push('@font-face declared');
  }
  if (/fonts\.(googleapis|gstatic)\.com/i.test(html)) {
    problems.push('external web-font reference');
  }

  // Preload/prefetch/modulepreload of external resources.
  if (/rel=["'](?:preload|prefetch|modulepreload)["'][^>]*href=["']https?:\/\//i.test(html)) {
    problems.push('external preload/prefetch');
  }

  return problems;
}

function fmt(bytes: number): string {
  return `${(bytes / KIB).toFixed(1)} KiB`;
}
function ok(v: boolean): string {
  return v ? 'OK' : 'FAIL';
}

main().catch((e) => {
  console.error(`audit:size failed: ${e.message}`);
  process.exitCode = 1;
});