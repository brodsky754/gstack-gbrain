// SSE event stream. Browser subscribes once on mount; server keeps it open and
// streams events from the in-process bus until the client disconnects.

import { createSseResponse } from '@/lib/sse-emitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(req: Request): Response {
  return createSseResponse(req);
}
