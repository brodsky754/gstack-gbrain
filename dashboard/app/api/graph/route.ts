// GET /api/graph?limit=N — graph snapshot for the right pane.
//
// The Server Component fetches this at render time, but exposing it as an
// endpoint lets the client refresh the graph without a full reload (handy for
// hackathon iteration).

import { NextResponse } from 'next/server';
import { rejectUntrustedHost } from '@/lib/request-guard';
import { parseIntParam } from '@/lib/query-params';
import { getGraphSnapshot } from '@/lib/gbrain-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  // Refuse DNS-rebound requests (see lib/request-guard.ts) before spawning gbrain.
  const forbidden = rejectUntrustedHost(req);
  if (forbidden) return forbidden;

  const { searchParams } = new URL(req.url);
  // Non-numeric input used to propagate NaN through Math.min/Math.max and
  // silently return an empty graph; fall back to the default instead.
  const limit = parseIntParam(searchParams.get('limit'), { fallback: 50, min: 5, max: 200 });

  try {
    const snapshot = await getGraphSnapshot(limit);
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
