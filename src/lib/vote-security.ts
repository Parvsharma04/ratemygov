import crypto from 'node:crypto';
import { getStateByIso } from './states';

/**
 * Normalises client IP addresses:
 * - IPv4: trimmed as-is
 * - IPv4-mapped IPv6: converted to standard IPv4
 * - IPv6: canonicalised and reduced to its first 64 bits (/64)
 */
export function normaliseIp(rawIp: string): string {
  const ip = rawIp.trim();

  // IPv4-mapped IPv6 (::ffff:192.0.2.1)
  if (ip.toLowerCase().startsWith('::ffff:') && ip.includes('.')) {
    return ip.slice(7);
  }

  // IPv4
  if (!ip.includes(':')) {
    return ip;
  }

  // IPv6: strip brackets or port if present
  const clean = ip.replace(/^\[/, '').replace(/\](?::\d+)?$/, '');
  const parts = clean.split('::');

  let left = parts[0] ? parts[0].split(':') : [];
  let right = parts[1] ? parts[1].split(':') : [];

  if (parts.length > 1) {
    const missing = 8 - (left.length + right.length);
    const middle = new Array(Math.max(0, missing)).fill('0');
    left = [...left, ...middle, ...right];
  }

  // Take the first 4 16-bit hextets (64 bits)
  const first64 = left
    .slice(0, 4)
    .map((h) => (h || '0').padStart(4, '0').toLowerCase());

  return `${first64.join(':')}::/64`;
}

/**
 * Extracts the client IP from request headers.
 * Uses x-real-ip, falling back to the first entry of x-forwarded-for.
 * On preview deployments with LOAD_TEST_KEY configured, allows x-loadtest-ip override.
 */
export function getClientIp(
  request: Request,
  envLoadTestKey = process.env.LOAD_TEST_KEY
): string | null {
  if (envLoadTestKey) {
    const reqKey = request.headers.get('x-loadtest-key');
    const loadTestIp = request.headers.get('x-loadtest-ip');
    if (reqKey && reqKey === envLoadTestKey && loadTestIp) {
      return loadTestIp.trim();
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return null;
}

export interface GeoLocation {
  country: string | null;
  region: string | null;
  geoState: number | null;
  geoStateSlug: string | null;
}

/**
 * Extracts and maps geolocation from platform headers (x-vercel-ip-country, x-vercel-ip-country-region).
 */
export function getGeoLocation(request: Request): GeoLocation {
  const country =
    request.headers.get('x-vercel-ip-country')?.trim().toUpperCase() || null;
  const region =
    request.headers.get('x-vercel-ip-country-region')?.trim().toUpperCase() || null;

  if (country === 'IN' && region) {
    const state = getStateByIso(region);
    if (state) {
      return {
        country,
        region,
        geoState: state.code,
        geoStateSlug: state.slug,
      };
    }
  }

  return {
    country,
    region,
    geoState: null,
    geoStateSlug: null,
  };
}

export interface GeoPolicyEvaluation {
  allowed: boolean;
  reason?: string;
}

/**
 * Evaluates the request against the configured GEO_MODE.
 * - flag: record only
 * - country: reject when country is known and is not IN
 * - state: reject when country is not IN, or detected state differs from selected state
 */
export function evaluateGeoPolicy(
  selectedStateCode: number,
  geo: GeoLocation,
  geoMode = process.env.GEO_MODE || 'flag'
): GeoPolicyEvaluation {
  if (geoMode === 'flag') {
    return { allowed: true };
  }

  if (geoMode === 'country' || geoMode === 'state') {
    if (geo.country && geo.country !== 'IN') {
      return {
        allowed: false,
        reason: 'Voting for this state is not available from your location.',
      };
    }
  }

  if (geoMode === 'state') {
    if (geo.geoState !== null && geo.geoState !== selectedStateCode) {
      return {
        allowed: false,
        reason: 'Voting for this state is not available from your location.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Verifies Cloudflare Turnstile token via siteverify API with 2s timeout.
 */
export async function verifyTurnstileToken(
  token: string | undefined | null,
  clientIp: string,
  secret = process.env.TURNSTILE_SECRET
): Promise<boolean> {
  if (!secret) {
    // If turnstile secret is not configured, skip verification
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secret);
    formData.append('response', token);
    formData.append('remoteip', clientIp);

    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(2000),
      }
    );

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * Parses or generates the 'rmg_d' device cookie (16 random bytes base64url).
 */
export function getOrCreateDeviceId(cookieHeader: string | null): {
  deviceId: string;
  isNew: boolean;
} {
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...valParts] = cookie.trim().split('=');
      if (name === 'rmg_d') {
        const val = valParts.join('=');
        // Validate 16-byte base64url string length (approx 22 chars)
        if (val && /^[A-Za-z0-9_-]{20,24}$/.test(val)) {
          return { deviceId: val, isNew: false };
        }
      }
    }
  }

  const newId = crypto.randomBytes(16).toString('base64url');
  return { deviceId: newId, isNew: true };
}

/**
 * Derives 16-byte HMAC-SHA256 hashes for voter device and normalised IP.
 * Raw identifiers are never stored or logged.
 */
export function deriveHashes(
  deviceId: string,
  normalisedIp: string,
  pepper = process.env.VOTER_PEPPER || ''
): { voterHash: Buffer; ipHash: Buffer } {
  const voterHash = crypto
    .createHmac('sha256', pepper)
    .update(`dev:${deviceId}`)
    .digest()
    .subarray(0, 16);

  const ipHash = crypto
    .createHmac('sha256', pepper)
    .update(`ip:${normalisedIp}`)
    .digest()
    .subarray(0, 16);

  return { voterHash, ipHash };
}
