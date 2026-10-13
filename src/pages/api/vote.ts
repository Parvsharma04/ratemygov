import type { APIRoute } from 'astro';
import { z } from 'zod';
import { getStateBySlug } from '../../lib/states';
import { castVote, getStateTotals } from '../../lib/votes';
import {
  getClientIp,
  normaliseIp,
  getGeoLocation,
  evaluateGeoPolicy,
  verifyTurnstileToken,
  getOrCreateDeviceId,
  deriveHashes,
} from '../../lib/vote-security';

export const prerender = false;

const voteSchema = z.object({
  state: z.string().trim(),
  choice: z.enum(['satisfied', 'dissatisfied']),
  token: z.string().optional().nullable(),
  'cf-turnstile-response': z.string().optional().nullable(),
  website: z.string().optional().nullable(),
});

export const POST: APIRoute = async ({ request, url }) => {
  // 1. Origin verification
  const origin = request.headers.get('origin');
  const expectedOrigin = url.origin;
  if (!origin || origin !== expectedOrigin) {
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // 2. Content-type and payload validation
  const contentType = request.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const isForm = contentType.includes('application/x-www-form-urlencoded');

  if (!isJson && !isForm) {
    return new Response('Unsupported Content-Type', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  let rawBody: unknown;
  if (isJson) {
    try {
      rawBody = await request.json();
    } catch {
      return new Response('Invalid JSON payload', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  } else {
    try {
      const formData = await request.formData();
      rawBody = {
        state: formData.get('state'),
        choice: formData.get('choice'),
        token: formData.get('cf-turnstile-response') || formData.get('token'),
        website: formData.get('website'),
      };
    } catch {
      return new Response('Invalid form data', {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
  }

  const parsed = voteSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response('Invalid submission data', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const selectedState = getStateBySlug(parsed.data.state);
  if (!selectedState) {
    return new Response('Invalid state selected', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // 2b. Honeypot bot defence: silently return fake success if honeypot is filled
  if (parsed.data.website && parsed.data.website.trim().length > 0) {
    if (isJson) {
      let totals;
      try {
        totals = await getStateTotals(selectedState.code);
      } catch {
        totals = {
          stateCode: selectedState.code,
          satisfied: 0,
          dissatisfied: 0,
          total: 0,
        };
      }
      return new Response(
        JSON.stringify({
          status: 'recorded',
          totals,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    return new Response(null, {
      status: 303,
      headers: {
        Location: `/state/${selectedState.slug}?voted=1`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // 3. Client IP extraction and normalisation
  const rawIp = getClientIp(request);
  if (!rawIp) {
    return new Response('Missing client IP', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const normalisedIp = normaliseIp(rawIp);

  // 4. Geolocation mapping and policy evaluation
  const geo = getGeoLocation(request);
  const geoPolicy = evaluateGeoPolicy(selectedState.code, geo);
  if (!geoPolicy.allowed) {
    return new Response(
      geoPolicy.reason || 'Voting for this state is not available from your location.',
      {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  // 5. Cloudflare Turnstile verification
  const turnstileToken =
    parsed.data.token || parsed.data['cf-turnstile-response'] || undefined;
  const turnstileValid = await verifyTurnstileToken(turnstileToken, rawIp);
  if (!turnstileValid) {
    return new Response('Turnstile verification failed', {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  // 6. Device cookie rmg_d
  const { deviceId } = getOrCreateDeviceId(request.headers.get('cookie'));
  const cookieHeader = `rmg_d=${deviceId}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`;

  // 7. Cryptographic hashes derivation
  const { voterHash, ipHash } = deriveHashes(deviceId, normalisedIp);

  // 8. Atomic vote submission
  try {
    const result = await castVote({
      stateCode: selectedState.code,
      choice: parsed.data.choice === 'satisfied',
      voterHash,
      ipHash,
      geoState: geo.geoState,
    });

    if (isJson) {
      const totals = await getStateTotals(selectedState.code);
      return new Response(
        JSON.stringify({
          status: result,
          totals,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader,
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Form request redirect
    const queryParam = result === 'recorded' ? 'voted=1' : 'voted=dup';
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/state/${selectedState.slug}?${queryParam}`,
        'Set-Cookie': cookieHeader,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    // 9. Database error fail-safe
    return new Response('Service Temporarily Unavailable', {
      status: 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  }
};
