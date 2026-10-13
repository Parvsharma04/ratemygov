import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  normaliseIp,
  getClientIp,
  getGeoLocation,
  evaluateGeoPolicy,
  getOrCreateDeviceId,
  deriveHashes,
  verifyTurnstileToken,
} from '../src/lib/vote-security';
import * as votesDb from '../src/lib/votes';
import { POST as voteHandler } from '../src/pages/api/vote';
import { GET as geoHandler } from '../src/pages/api/geo';

describe('Vote Security & Utility Functions', () => {
  describe('IP Normalisation', () => {
    it('preserves IPv4 addresses as-is', () => {
      expect(normaliseIp('192.168.1.1')).toBe('192.168.1.1');
      expect(normaliseIp(' 10.0.0.2 ')).toBe('10.0.0.2');
    });

    it('unpacks IPv4-mapped IPv6 addresses', () => {
      expect(normaliseIp('::ffff:192.0.2.128')).toBe('192.0.2.128');
    });

    it('normalises full IPv6 addresses to first 64 bits', () => {
      expect(normaliseIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
        '2001:0db8:85a3:0000::/64'
      );
    });

    it('expands compressed IPv6 addresses to first 64 bits', () => {
      expect(normaliseIp('2001:db8::1')).toBe('2001:0db8:0000:0000::/64');
      expect(normaliseIp('::1')).toBe('0000:0000:0000:0000::/64');
    });

    it('handles bracketed IPv6 with ports', () => {
      expect(normaliseIp('[2001:db8:1:2:3:4:5:6]:8080')).toBe(
        '2001:0db8:0001:0002::/64'
      );
    });
  });

  describe('Client IP Extraction', () => {
    it('prefers x-real-ip header', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-real-ip': '203.0.113.195',
          'x-forwarded-for': '198.51.100.1, 192.0.2.1',
        },
      });
      expect(getClientIp(req)).toBe('203.0.113.195');
    });

    it('falls back to the first entry of x-forwarded-for', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-forwarded-for': '198.51.100.1, 192.0.2.1',
        },
      });
      expect(getClientIp(req)).toBe('198.51.100.1');
    });

    it('returns null when no IP headers are present', () => {
      const req = new Request('http://localhost');
      expect(getClientIp(req)).toBeNull();
    });

    it('allows preview load-testing override only when LOAD_TEST_KEY matches', () => {
      const secret = 'staging-test-key-123';
      const reqWithKey = new Request('http://localhost', {
        headers: {
          'x-real-ip': '1.1.1.1',
          'x-loadtest-key': secret,
          'x-loadtest-ip': '10.99.88.77',
        },
      });
      expect(getClientIp(reqWithKey, secret)).toBe('10.99.88.77');

      const reqWrongKey = new Request('http://localhost', {
        headers: {
          'x-real-ip': '1.1.1.1',
          'x-loadtest-key': 'wrong-key',
          'x-loadtest-ip': '10.99.88.77',
        },
      });
      expect(getClientIp(reqWrongKey, secret)).toBe('1.1.1.1');
    });
  });

  describe('Geolocation Mapping and Policy', () => {
    it('maps valid Indian region codes to state code and slug', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-vercel-ip-country': 'IN',
          'x-vercel-ip-country-region': 'DL',
        },
      });
      const geo = getGeoLocation(req);
      expect(geo.country).toBe('IN');
      expect(geo.geoState).toBe(9); // Delhi
      expect(geo.geoStateSlug).toBe('delhi');
    });

    it('maps legacy ISO aliases like OR for Odisha', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-vercel-ip-country': 'IN',
          'x-vercel-ip-country-region': 'OR',
        },
      });
      const geo = getGeoLocation(req);
      expect(geo.geoState).toBe(26); // Odisha
      expect(geo.geoStateSlug).toBe('odisha');
    });

    it('returns null geoState when country is not IN', () => {
      const req = new Request('http://localhost', {
        headers: {
          'x-vercel-ip-country': 'US',
          'x-vercel-ip-country-region': 'CA',
        },
      });
      const geo = getGeoLocation(req);
      expect(geo.country).toBe('US');
      expect(geo.geoState).toBeNull();
      expect(geo.geoStateSlug).toBeNull();
    });

    it('applies GEO_MODE flag (always allowed)', () => {
      const geo = { country: 'US', region: 'CA', geoState: null, geoStateSlug: null };
      const evaluation = evaluateGeoPolicy(9, geo, 'flag');
      expect(evaluation.allowed).toBe(true);
    });

    it('applies GEO_MODE country (rejects foreign country)', () => {
      const foreignGeo = { country: 'US', region: 'CA', geoState: null, geoStateSlug: null };
      const rejected = evaluateGeoPolicy(9, foreignGeo, 'country');
      expect(rejected.allowed).toBe(false);
      expect(rejected.reason).toBe('Voting for this state is not available from your location.');

      const inGeo = { country: 'IN', region: 'DL', geoState: 9, geoStateSlug: 'delhi' };
      const allowed = evaluateGeoPolicy(9, inGeo, 'country');
      expect(allowed.allowed).toBe(true);
    });

    it('applies GEO_MODE state (rejects mismatching state)', () => {
      const mismatch = { country: 'IN', region: 'MH', geoState: 21, geoStateSlug: 'maharashtra' };
      const rejected = evaluateGeoPolicy(9, mismatch, 'state'); // selected Delhi (9)
      expect(rejected.allowed).toBe(false);
      expect(rejected.reason).toBe('Voting for this state is not available from your location.');

      const match = { country: 'IN', region: 'DL', geoState: 9, geoStateSlug: 'delhi' };
      const allowed = evaluateGeoPolicy(9, match, 'state');
      expect(allowed.allowed).toBe(true);
    });
  });

  describe('Device Cookie and Hashes', () => {
    it('generates a new base64url device ID if cookie is missing', () => {
      const res = getOrCreateDeviceId(null);
      expect(res.isNew).toBe(true);
      expect(res.deviceId).toMatch(/^[A-Za-z0-9_-]{20,24}$/);
    });

    it('reuses existing valid rmg_d cookie', () => {
      const existingId = 'abcdef1234567890_-ab';
      const cookieHeader = `other=foo; rmg_d=${existingId}; session=xyz`;
      const res = getOrCreateDeviceId(cookieHeader);
      expect(res.isNew).toBe(false);
      expect(res.deviceId).toBe(existingId);
    });

    it('derives 16-byte HMAC hashes with pepper', () => {
      const pepper = 'test-secret-pepper-12345678901234567890';
      const hashes1 = deriveHashes('dev-1', '1.2.3.4', pepper);
      expect(hashes1.voterHash.length).toBe(16);
      expect(hashes1.ipHash.length).toBe(16);

      const hashes2 = deriveHashes('dev-2', '1.2.3.4', pepper);
      expect(hashes1.voterHash.equals(hashes2.voterHash)).toBe(false);
      expect(hashes1.ipHash.equals(hashes2.ipHash)).toBe(true);
    });

    it('bypasses Turnstile when TURNSTILE_SECRET is unset, and fails when token missing if set', async () => {
      const allowedWithoutSecret = await verifyTurnstileToken(undefined, '1.2.3.4', undefined);
      expect(allowedWithoutSecret).toBe(true);

      const rejectedWithSecret = await verifyTurnstileToken(undefined, '1.2.3.4', '0x4AAAA...');
      expect(rejectedWithSecret).toBe(false);
    });
  });
});

describe('Vote and Geo API Endpoints (DB Mocked)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects vote requests with mismatched Origin header (403)', async () => {
    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://evil.com',
        'content-type': 'application/json',
      },
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects unsupported Content-Type (400)', async () => {
    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'text/plain',
      },
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(400);
  });

  it('rejects invalid state slug (400)', async () => {
    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/json',
        'x-real-ip': '1.2.3.4',
      },
      body: JSON.stringify({
        state: 'non-existent-state',
        choice: 'satisfied',
      }),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(400);
  });

  it('rejects invalid vote choice (400)', async () => {
    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/json',
        'x-real-ip': '1.2.3.4',
      },
      body: JSON.stringify({
        state: 'delhi',
        choice: 'neutral',
      }),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(400);
  });

  it('rejects requests missing client IP (400)', async () => {
    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        state: 'delhi',
        choice: 'satisfied',
      }),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(400);
  });

  it('records JSON vote, sets rmg_d cookie, and returns totals', async () => {
    vi.spyOn(votesDb, 'castVote').mockResolvedValue('recorded');
    vi.spyOn(votesDb, 'getStateTotals').mockResolvedValue({
      stateCode: 9,
      satisfied: 42,
      dissatisfied: 10,
      total: 52,
    });

    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.1',
      },
      body: JSON.stringify({
        state: 'delhi',
        choice: 'satisfied',
      }),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Set-Cookie')).toContain('rmg_d=');
    expect(res.headers.get('Set-Cookie')).toContain('HttpOnly');
    expect(res.headers.get('Set-Cookie')).toContain('SameSite=Lax');

    const json = await res.json();
    expect(json.status).toBe('recorded');
    expect(json.totals).toEqual({
      stateCode: 9,
      satisfied: 42,
      dissatisfied: 10,
      total: 52,
    });
  });

  it('redirects form submission with 303 to /state/<slug>?voted=1 on success', async () => {
    vi.spyOn(votesDb, 'castVote').mockResolvedValue('recorded');

    const formData = new URLSearchParams();
    formData.append('state', 'delhi');
    formData.append('choice', 'satisfied');

    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/x-www-form-urlencoded',
        'x-real-ip': '203.0.113.1',
      },
      body: formData.toString(),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/state/delhi?voted=1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('redirects duplicate form submission with 303 to /state/<slug>?voted=dup', async () => {
    vi.spyOn(votesDb, 'castVote').mockResolvedValue('duplicate');

    const formData = new URLSearchParams();
    formData.append('state', 'delhi');
    formData.append('choice', 'dissatisfied');

    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/x-www-form-urlencoded',
        'x-real-ip': '203.0.113.1',
      },
      body: formData.toString(),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
      locals: { runtime: { env: { DB: {} } } },
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/state/delhi?voted=dup');
  });

  it('returns 503 on database error without exposing details', async () => {
    vi.spyOn(votesDb, 'castVote').mockRejectedValue(new Error('Connection failure'));

    const req = new Request('https://ratemygov.in/api/vote', {
      method: 'POST',
      headers: {
        origin: 'https://ratemygov.in',
        'content-type': 'application/json',
        'x-real-ip': '203.0.113.1',
      },
      body: JSON.stringify({
        state: 'delhi',
        choice: 'satisfied',
      }),
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/vote'),
    } as any;

    const res = await voteHandler(context);
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const text = await res.text();
    expect(text).toBe('Service Temporarily Unavailable');
  });

  it('returns detected state slug in GET /api/geo', async () => {
    const req = new Request('https://ratemygov.in/api/geo', {
      headers: {
        'x-vercel-ip-country': 'IN',
        'x-vercel-ip-country-region': 'KA', // Karnataka
      },
    });

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/geo'),
    } as any;

    const res = await geoHandler(context);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    const json = await res.json();
    expect(json.state).toBe('karnataka');
  });

  it('returns null in GET /api/geo when country is unknown', async () => {
    const req = new Request('https://ratemygov.in/api/geo');

    const context = {
      request: req,
      url: new URL('https://ratemygov.in/api/geo'),
    } as any;

    const res = await geoHandler(context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.state).toBeNull();
  });
});
