// POST /api/ship — { slug, repo_path?, command? }
//
// Emits a `trace_lineage` event (graph animates the path the spawned agent
// will read) and then triggers the macOS clipboard + Terminal handoff.

import { NextResponse } from 'next/server';
import { shipThis } from '@/lib/ship-this';
import { listEdges } from '@/lib/gbrain-client';
import { bus } from '@/lib/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ShipRequest {
  slug: string;
  repo_path?: string;
  command?: string;
}

export async function POST(req: Request): Promise<Response> {
  let body: ShipRequest;
  try {
    body = (await req.json()) as ShipRequest;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  if (!body.slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  // Default repo path: the directory the dashboard was launched from.
  // The hackathon user can override per-request to /office-hours in any repo.
  const repoPath = body.repo_path ?? process.cwd();

  // Emit trace_lineage BEFORE the terminal opens so the animation plays during
  // the demo. Edges define the path the agent will likely traverse.
  try {
    const edges = await listEdges([body.slug]);
    const lineageSlugs = [body.slug, ...edges.slice(0, 6).map((e) => e.target)];
    bus.publish('trace_lineage', { slugs: lineageSlugs, reason: 'ship_this' });
  } catch {
    // Lineage is cosmetic; don't fail the ship on a bad query.
  }

  // Wait a beat so the trace_lineage animation has time to start before the
  // user's attention shifts to the Terminal window.
  await new Promise((r) => setTimeout(r, 1500));

  const result = await shipThis({
    repoPath,
    brainSlug: body.slug,
    command: body.command,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
