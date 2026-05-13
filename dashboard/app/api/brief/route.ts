// POST /api/brief — pulls today's context from gbrain, emits a `zoom_to` event
// (so the graph follows), returns the BriefMeResult shape.

import { NextResponse } from 'next/server';
import { listMeetingsToday, query, getPage } from '@/lib/gbrain-client';
import { bus } from '@/lib/event-bus';
import type { BriefMeResult, BrainPage } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  try {
    const today_meetings = await listMeetingsToday();

    // Related people: extract people slugs from today's meeting frontmatter
    // (frontmatter.attendees), de-dup, fetch each page.
    const attendeeSlugs = new Set<string>();
    for (const meeting of today_meetings) {
      const attendees = (meeting.frontmatter?.attendees ?? []) as unknown;
      if (Array.isArray(attendees)) {
        for (const a of attendees) {
          if (typeof a === 'string') attendeeSlugs.add(a);
        }
      }
    }
    const related_people = (
      await Promise.all([...attendeeSlugs].map((slug) => getPage(slug)))
    ).filter((p): p is BrainPage => p !== null);

    // Open threads: simple v1 = pages with `status: open` in frontmatter
    // returned from a query. TODO(hackathon): refine the query to match the
    // user's actual brain-filing convention for "open threads."
    const openResults = await query('status:open OR thread:open', 10);
    const open_threads = (
      await Promise.all(openResults.map((r) => getPage(r.slug)))
    ).filter((p): p is BrainPage => p !== null);

    const zoom_slugs = [
      ...today_meetings.map((p) => p.slug),
      ...related_people.map((p) => p.slug),
    ];

    // Fire-and-forget the zoom_to event so the graph follows.
    bus.publish('zoom_to', { slugs: zoom_slugs, reason: 'brief_me' });

    const body: BriefMeResult = {
      generated_at: new Date().toISOString(),
      today_meetings,
      related_people,
      open_threads,
      zoom_slugs,
    };
    return NextResponse.json(body);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
