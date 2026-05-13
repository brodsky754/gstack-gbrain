// GET /api/graph?limit=N — graph snapshot for the right pane.
//
// The Server Component fetches this at render time, but exposing it as an
// endpoint lets the client refresh the graph without a full reload (handy for
// hackathon iteration).

import { NextResponse } from 'next/server';
import { getGraphSnapshot } from '@/lib/gbrain-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 5), 200);

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
