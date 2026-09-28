// Loopback-Host gate for every request (page, API routes, SSE, static).
//
// The dashboard has no auth; its only protection is "you must be on this
// machine". A DNS-rebinding page (attacker-controlled hostname whose DNS
// answer flips to 127.0.0.1) defeats the Origin/Sec-Fetch-Site checks in
// lib/request-guard.ts, because from the browser's point of view the request
// IS same-origin. The one thing such a request cannot fake is the Host header:
// it carries the attacker's hostname, never a loopback name. Refuse anything
// whose Host is not loopback (or opted in via GSTACK_HUD_ALLOWED_HOSTS).
//
// Runs on the Edge runtime; lib/request-guard.ts is pure and imports nothing
// from Node, so it is safe to use here.

import { NextResponse, type NextRequest } from 'next/server';
import { checkHost } from './lib/request-guard';

export function middleware(req: NextRequest): NextResponse {
  const check = checkHost(req.headers);
  if (check.ok) return NextResponse.next();
  return NextResponse.json({ error: `forbidden: ${check.reason}` }, { status: 403 });
}
