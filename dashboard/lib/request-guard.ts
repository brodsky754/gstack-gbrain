// Same-origin guard for state-changing route handlers.
//
// The dashboard listens on localhost with no auth, and POST /api/ship spawns
// Terminal + writes attacker-supplied text to the clipboard. Any web page open
// in the user's browser can send a cross-site POST to http://localhost:3000
// (a "simple" request with a text/plain body needs no CORS preflight, and
// Request.json() parses the body regardless of Content-Type). The browser
// still attaches Origin and Sec-Fetch-Site to that request, so we can refuse
// anything that did not come from the dashboard's own page.
//
// Pure function over Headers — unit-tested without spawning a server.

export interface OriginCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Accepts a request when it provably came from the dashboard's own origin, or
 * from a non-browser client that sends neither Origin nor Sec-Fetch-Site
 * (curl, the Next server itself). Rejects any browser-originated cross-site
 * request.
 */
export function checkSameOrigin(headers: Headers): OriginCheck {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite !== null) {
    // Browsers always send this for fetch/XHR/form posts. 'none' is a direct
    // navigation (address bar); 'same-origin' is our own page.
    if (fetchSite === 'same-origin' || fetchSite === 'none') return { ok: true };
    return { ok: false, reason: `cross-site request rejected (sec-fetch-site=${fetchSite})` };
  }

  const origin = headers.get('origin');
  if (origin === null) {
    // No Origin header: not a browser-initiated cross-site POST.
    return { ok: true };
  }

  const host = headers.get('host');
  if (!host) {
    return { ok: false, reason: 'origin present but host header missing' };
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host; // includes port when non-default
  } catch {
    // "null" (sandboxed iframe, file://) or malformed.
    return { ok: false, reason: `unparseable origin "${origin}"` };
  }

  if (originHost.toLowerCase() !== host.toLowerCase()) {
    return { ok: false, reason: `origin host "${originHost}" does not match request host "${host}"` };
  }
  return { ok: true };
}

/**
 * Convenience for route handlers: returns a 403 Response to send back, or
 * null when the request may proceed.
 */
export function rejectCrossOrigin(req: Request): Response | null {
  const check = checkSameOrigin(req.headers);
  if (check.ok) return null;
  return new Response(JSON.stringify({ error: `forbidden: ${check.reason}` }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}
