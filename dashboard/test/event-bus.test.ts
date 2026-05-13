import { describe, test, expect, beforeEach } from 'bun:test';
import { EventBus } from '../lib/event-bus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  test('publish + subscribe delivers events in order', () => {
    const received: string[] = [];
    bus.subscribe((e) => received.push(e.type));
    bus.publish('session_active', { session_id: 'a' });
    bus.publish('tool_call', { session_id: 'a', tool_name: 'Read' });
    expect(received).toEqual(['session_active', 'tool_call']);
  });

  test('publish returns the event with monotonic id', () => {
    const a = bus.publish('session_active', { x: 1 });
    const b = bus.publish('session_active', { x: 2 });
    expect(a.id).toBe('1');
    expect(b.id).toBe('2');
    expect(Number(b.id)).toBeGreaterThan(Number(a.id));
  });

  test('unsubscribe stops further deliveries', () => {
    const received: string[] = [];
    const unsub = bus.subscribe((e) => received.push(e.type));
    bus.publish('session_active', {});
    unsub();
    bus.publish('session_active', {});
    expect(received).toHaveLength(1);
  });

  test('replay returns events after the given id', () => {
    bus.publish('session_active', { i: 1 });
    const second = bus.publish('session_active', { i: 2 });
    bus.publish('session_active', { i: 3 });
    const replayed = bus.replay(second.id);
    expect(replayed.map((e) => (e.payload as { i: number }).i)).toEqual([3]);
  });

  test('replay with unknown id returns full buffer (full replay fallback)', () => {
    bus.publish('session_active', { i: 1 });
    bus.publish('session_active', { i: 2 });
    const replayed = bus.replay('does-not-exist');
    expect(replayed).toHaveLength(2);
  });

  test('replay with no id returns full buffer', () => {
    bus.publish('session_active', { i: 1 });
    bus.publish('session_active', { i: 2 });
    const replayed = bus.replay();
    expect(replayed).toHaveLength(2);
  });

  test('ring buffer caps at 50 events', () => {
    for (let i = 0; i < 75; i++) {
      bus.publish('session_active', { i });
    }
    const replayed = bus.replay();
    expect(replayed).toHaveLength(50);
    // Oldest should be event #25 (since 75 - 50 = 25 dropped).
    expect((replayed[0].payload as { i: number }).i).toBe(25);
  });

  test('a throwing subscriber does not stop the bus', () => {
    const received: string[] = [];
    bus.subscribe(() => {
      throw new Error('handler failed');
    });
    bus.subscribe((e) => received.push(e.type));
    bus.publish('session_active', {});
    expect(received).toEqual(['session_active']);
  });
});
