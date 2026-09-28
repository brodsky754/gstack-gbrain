import { describe, test, expect } from 'bun:test';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// The middleware is the one place that covers EVERY request (the page, the
// SSE stream, static assets) with the loopback-Host check. Route-level guards
// are defense in depth on top of it.
describe('middleware: every request must carry a loopback Host', () => {
  test('DNS-rebound host is rejected with 403 before any route runs', async () => {
    const req = new NextRequest('http://evil.example:3000/api/events', {
      headers: { host: 'evil.example:3000' },
    });
    const res = middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not loopback/);
  });

  test('localhost passes through to the route', () => {
    const req = new NextRequest('http://localhost:3000/', {
      headers: { host: 'localhost:3000' },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  test('127.0.0.1 and [::1] pass through too', () => {
    for (const host of ['127.0.0.1:3000', '[::1]:3000']) {
      const req = new NextRequest(`http://${host}/api/graph`, { headers: { host } });
      expect(middleware(req).status).toBe(200);
    }
  });
});
