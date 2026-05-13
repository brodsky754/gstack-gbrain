// In-process pub/sub event bus with a ring buffer for SSE reconnect replay.
// Single instance across the Next.js server process.

import type { BusEvent, BusEventType } from './types';

const RING_BUFFER_SIZE = 50; // events kept for last-event-id replay

// Internal storage erases the payload type; consumers downcast in their handler.
type AnyBusEvent = BusEvent<object>;
type Handler = (event: AnyBusEvent) => void;

export class EventBus {
  private handlers = new Set<Handler>();
  private ring: AnyBusEvent[] = [];
  private nextId = 1;

  publish<T extends object>(
    type: BusEventType,
    payload: T,
  ): BusEvent<T> {
    const event: BusEvent<T> = {
      id: String(this.nextId++),
      type,
      timestamp: Date.now(),
      payload,
    };
    this.ring.push(event as AnyBusEvent);
    if (this.ring.length > RING_BUFFER_SIZE) {
      this.ring.shift();
    }
    for (const handler of this.handlers) {
      try {
        handler(event as AnyBusEvent);
      } catch (err) {
        // Never let a bad subscriber take down the bus.
        // eslint-disable-next-line no-console
        console.error('[event-bus] handler error:', err);
      }
    }
    return event;
  }

  subscribe(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /** Replay events since the given id (exclusive). Empty array if none. */
  replay(sinceId?: string): AnyBusEvent[] {
    if (!sinceId) return [...this.ring];
    const idx = this.ring.findIndex(e => e.id === sinceId);
    if (idx === -1) return [...this.ring]; // unknown id → full replay
    return this.ring.slice(idx + 1);
  }

  /** Test-only — reset state between cases. */
  __resetForTests(): void {
    this.handlers.clear();
    this.ring = [];
    this.nextId = 1;
  }
}

// Module-level singleton. One bus per server process.
declare global {
  // eslint-disable-next-line no-var
  var __gstackBus: EventBus | undefined;
}

export const bus: EventBus = globalThis.__gstackBus ?? (globalThis.__gstackBus = new EventBus());
