import { describe, it, expect } from 'vitest';
import { POST } from '../src/pages/api/vote';
import { GET } from '../src/pages/api/health';

describe('Bot defence and health monitoring', () => {
  it('silently returns fake success when honeypot website field is filled (JSON)', async () => {
    const req = new Request('http://localhost:4321/api/vote', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4321',
        'content-type': 'application/json',
        'x-real-ip': '1.2.3.4',
        'x-vercel-ip-country': 'IN',
        'x-vercel-ip-country-region': 'DL',
      },
      body: JSON.stringify({
        state: 'delhi',
        choice: 'satisfied',
        website: 'https://spam-bot.example.com',
      }),
    });

    const res = await POST({
      request: req,
      url: new URL('http://localhost:4321/api/vote'),
    } as any);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('recorded');
    expect(data.totals).toBeDefined();
  });

  it('silently redirects to voted=1 when honeypot website field is filled (Form submission)', async () => {
    const formData = new URLSearchParams();
    formData.set('state', 'delhi');
    formData.set('choice', 'satisfied');
    formData.set('website', 'automated-bot-entry');

    const req = new Request('http://localhost:4321/api/vote', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4321',
        'content-type': 'application/x-www-form-urlencoded',
        'x-real-ip': '1.2.3.4',
        'x-vercel-ip-country': 'IN',
        'x-vercel-ip-country-region': 'DL',
      },
      body: formData.toString(),
    });

    const res = await POST({
      request: req,
      url: new URL('http://localhost:4321/api/vote'),
    } as any);

    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/state/delhi?voted=1');
  });

  it('rejects unauthorized access to /api/health when CRON_SECRET is missing or wrong', async () => {
    process.env.CRON_SECRET = 'secret_test_key_123';

    // Missing header
    const req1 = new Request('http://localhost:4321/api/health', {
      method: 'GET',
    });
    const res1 = await GET({ request: req1 } as any);
    expect(res1.status).toBe(401);

    // Wrong header
    const req2 = new Request('http://localhost:4321/api/health', {
      method: 'GET',
      headers: {
        cron_secret: 'wrong_secret',
      },
    });
    const res2 = await GET({ request: req2 } as any);
    expect(res2.status).toBe(401);
  });

  it('authenticates /api/health with valid CRON_SECRET header', async () => {
    process.env.CRON_SECRET = 'secret_test_key_123';

    const req = new Request('http://localhost:4321/api/health', {
      method: 'GET',
      headers: {
        cron_secret: 'secret_test_key_123',
      },
    });

    const res = await GET({ request: req } as any);
    // In unit test without real postgres connection, health catches DB and returns 500 or 200
    // But importantly it passed the 401 authorization barrier!
    expect([200, 500]).toContain(res.status);
    if (res.status === 200) {
      const data = await res.json();
      expect(data.status).toBe('ok');
      expect(data.windowMinutes).toBe(5);
      expect(Array.isArray(data.states)).toBe(true);
      expect(data.states.length).toBe(36);
    }
  });
});
