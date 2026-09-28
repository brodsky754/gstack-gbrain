// SSE event stream. Browser subscribes once on mount; server keeps it open and
// streams events from the in-process bus until the client disconnects.

import { rejectUntrustedHost } from '@/lib/request-guard';
import { createSseResponse } from '@/lib/sse-emitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request): Response {
  // The stream carries every tool_call input from the user's Claude sessions.
  // Refuse DNS-rebound requests (see lib/request-guard.ts) before subscribing.
  const forbidden = rejectUntrustedHost(req);
  if (forbidden) return forbidden;

  return createSseResponse(req);
}
