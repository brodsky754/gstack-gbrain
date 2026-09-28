// Request guards for the localhost-only dashboard.
//
// The dashboard listens on localhost with no auth, and POST /api/ship spawns
// Terminal + writes attacker-supplied text to the clipboard. Two browser-side
// attacks reach it:
//
// 1. Cross-site POST. Any web page open in the user's browser can send a
//    "simple" request with a text/plain body to http://localhost:3000 (no
//    CORS preflight, and Request.json() parses the body regardless of
//    Content-Type). The browser still attaches Origin and Sec-Fetch-Site, so
//    we refuse anything that did not come from the dashboard's own page.
//
// 2. DNS rebinding. A page at http://evil.example:3000 whose DNS answer is
//    flipped to 127.0.0.1 reaches us with Origin == Host and
//    Sec-Fetch-Site: same-origin, so check 1 passes. The one header such a
//    request cannot fake is Host: it carries the attacker's hostname, never a
//    loopback name. So every request must carry a loopback Host (or one
//    explicitly opted in via GSTACK_HUD_ALLOWED_HOSTS, comma-separated).
//
// Pure functions over Headers — unit-tested without spawning a server, and
// importable from the Edge-runtime middleware (no Node imports here).

export interface OriginCheck {
  ok: boolean;
  reason?: string;
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/** "localhost:3000" -> "localhost", "[::1]:3000" -> "[::1]". Lowercased. */
function hostnameOf(host: string): string {
  const m = /^(\[[^\]]*\]|[^:]*)(?::\d+)?$/.exec(host.trim());
  return (m ? m[1] : host.trim()).toLowerCase();
}

/**
 * True when `host` (a Host header value, port optional) is a loopback name
 * or is listed in `extraAllowed` (defaults to GSTACK_HUD_ALLOWED_HOSTS).
 * The suffix rule `*.localhost` matches RFC 6761 behavior in browsers.
 */
export function isAllowedHost(
  host: string | null | undefined,
  extraAllowed: string | undefined = process.env.GSTACK_HUD_ALLOWED_HOSTS,
): boolean {
  if (!host) return false;
  const name = hostnameOf(host);
  if (!name) return false;
  if (LOOPBACK_HOSTNAMES.has(name) || name.endsWith('.localhost')) return true;
  const extra = (extraAllowed ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(name);
}

/** Rejects any request whose Host header is not a loopback name (DNS rebinding). */
export function checkHost(headers: Headers): OriginCheck {
  const host = headers.get('host');
  if (!host) {
    return { ok: false, reason: 'host header missing' };
  }
  if (!isAllowedHost(host)) {
    return {
      ok: false,
      reason: `request host "${host}" is not loopback (possible DNS rebinding); ` +
        'set GSTACK_HUD_ALLOWED_HOSTS to allow it',
    };
  }
  return { ok: true };
}

/**
 * Accepts a request when its Host is loopback AND it provably came from the
 * dashboard's own origin, or from a non-browser client that sends neither
 * Origin nor Sec-Fetch-Site (curl, the Next server itself). Rejects any
 * browser-originated cross-site request and any DNS-rebound request.
 */
export function checkSameOrigin(headers: Headers): OriginCheck {
  // Host first: a rebound request looks same-origin to every other check.
  const hostCheck = checkHost(headers);
  if (!hostCheck.ok) return hostCheck;

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

  const host = headers.get('host')!; // present: checkHost passed above

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

function forbidden(reason: string | undefined): Response {
  return new Response(JSON.stringify({ error: `forbidden: ${reason}` }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Convenience for state-changing route handlers: returns a 403 Response to
 * send back, or null when the request may proceed.
 */
export function rejectCrossOrigin(req: Request): Response | null {
  const check = checkSameOrigin(req.headers);
  if (check.ok) return null;
  return forbidden(check.reason);
}

/**
 * Convenience for read-only route handlers (GET): only the loopback-Host
 * check, so a top-level navigation linked from another site still works.
 * Returns a 403 Response to send back, or null when the request may proceed.
 */
export function rejectUntrustedHost(req: Request): Response | null {
  const check = checkHost(req.headers);
  if (check.ok) return null;
  return forbidden(check.reason);
}
