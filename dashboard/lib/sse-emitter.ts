// Server-Sent Events helper. Subscribes to the in-process event bus and
// streams events to a connected browser. Supports last-event-id replay on
// reconnect via the bus's ring buffer.

import type { BusEvent } from './types';
import { bus } from './event-bus';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Disable buffering in any proxy in front of Next.js (none expected locally,
  // but harmless to declare).
  'X-Accel-Buffering': 'no',
} as const;

function formatSseFrame(event: BusEvent): string {
  // Per spec: each event is `id: ...\nevent: ...\ndata: ...\n\n`.
  // Data is JSON-encoded; multi-line data fields would need per-line `data:`,
  // but JSON on one line keeps this simple.
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`;
}

/**
 * Build a Response with an SSE stream subscribed to the bus.
 * Honors `Last-Event-ID` header for replay.
 */
export function createSseResponse(req: Request): Response {
  const lastEventId = req.headers.get('last-event-id') ?? undefined;
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // 1. Replay buffered events since last-event-id (or full buffer).
      const replay = bus.replay(lastEventId);
      for (const ev of replay) {
        controller.enqueue(encoder.encode(formatSseFrame(ev)));
      }

      // 2. Subscribe for new events.
      unsubscribe = bus.subscribe((ev) => {
        try {
          controller.enqueue(encoder.encode(formatSseFrame(ev)));
        } catch {
          // Stream is closed; let cancel() clean up.
        }
      });

      // 3. Heartbeat (comment line every 15s) so proxies + browsers don't
      // close idle connections.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          // Stream closed; cancel() will fire shortly.
        }
      }, 15_000);
    },
    cancel() {
      unsubscribe?.();
      unsubscribe = null;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
