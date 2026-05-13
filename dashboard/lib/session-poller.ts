// Polls ~/.claude/projects/*/sessions/*.jsonl every N seconds, diffs each
// file's line count, parses new lines, and publishes events to the bus.
//
// Booted once at server start via instrumentation.ts.

import 'server-only';
import { readdir, stat, open } from 'fs/promises';
import { homedir } from 'os';
import { join, basename } from 'path';

import { bus } from './event-bus';
import {
  parseSessionLine,
  applyLineToTracker,
  trackerToActiveEvent,
  freshTracker,
  type SessionTracker,
} from './jsonl-parser';

const DEFAULT_DIR = join(homedir(), '.claude', 'projects');
const DEFAULT_INTERVAL_MS = 2_000;

export interface PollerOptions {
  dir?: string;
  intervalMs?: number;
}

interface FileCursor {
  /** Bytes read so far. */
  offset: number;
  /** Tracker for this session id. */
  tracker: SessionTracker;
}

export interface SessionPoller {
  start(): void;
  stop(): void;
}

export function createSessionPoller(opts: PollerOptions = {}): SessionPoller {
  const dir = opts.dir ?? DEFAULT_DIR;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const cursors = new Map<string, FileCursor>(); // key: full path to .jsonl

  let running = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    try {
      const sessionFiles = await findSessionFiles(dir);
      for (const path of sessionFiles) {
        try {
          await readNewLines(path, cursors);
        } catch (err) {
          // Per-file failure must not stall the loop.
          bus.publish('parse_error', {
            path,
            error: (err as Error).message,
          });
        }
      }
      // Heartbeat: emit session_active for every tracker we know about.
      for (const cursor of cursors.values()) {
        bus.publish('session_active', trackerToActiveEvent(cursor.tracker));
      }
    } catch (err) {
      bus.publish('parse_error', {
        error: `[session-poller] tick failed: ${(err as Error).message}`,
      });
    } finally {
      if (running) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      // First tick fires immediately, subsequent ticks honor intervalMs.
      void tick();
    },
    stop() {
      running = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

/**
 * Find all session JSONL files. Layout:
 * ~/.claude/projects/<project-slug>/sessions/<session-id>.jsonl
 */
async function findSessionFiles(rootDir: string): Promise<string[]> {
  const result: string[] = [];
  let projects: string[];
  try {
    projects = await readdir(rootDir);
  } catch {
    return [];
  }
  for (const project of projects) {
    const sessionsDir = join(rootDir, project, 'sessions');
    let sessions: string[];
    try {
      sessions = await readdir(sessionsDir);
    } catch {
      continue;
    }
    for (const session of sessions) {
      if (session.endsWith('.jsonl')) {
        result.push(join(sessionsDir, session));
      }
    }
  }
  return result;
}

/**
 * Read new bytes since the last cursor and parse line-by-line.
 * Tolerates a partially-written final line by leaving the cursor before
 * the trailing newline.
 */
async function readNewLines(
  path: string,
  cursors: Map<string, FileCursor>,
): Promise<void> {
  const st = await stat(path);
  const existing = cursors.get(path);
  const offset = existing?.offset ?? 0;
  if (st.size <= offset) {
    return;
  }

  const fd = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(st.size - offset);
    await fd.read(buffer, 0, buffer.length, offset);
    const text = buffer.toString('utf-8');

    // Split on newlines; keep an incomplete final line for next tick.
    const lastNewline = text.lastIndexOf('\n');
    const completeBlock = lastNewline === -1 ? '' : text.slice(0, lastNewline);
    const newOffset = offset + Buffer.byteLength(completeBlock, 'utf-8') + (lastNewline === -1 ? 0 : 1);

    let tracker = existing?.tracker;
    if (!tracker) {
      const sessionId = basename(path, '.jsonl');
      const projectSlug = basename(join(path, '..', '..'));
      tracker = freshTracker(sessionId, projectSlug);
      bus.publish('session_started', {
        session_id: tracker.session_id,
        project_slug: tracker.project_slug,
      });
    }

    if (completeBlock.length > 0) {
      const lines = completeBlock.split('\n');
      for (const line of lines) {
        const parsed = parseSessionLine(line);
        if (!parsed) continue;
        const events = applyLineToTracker(tracker, parsed);
        for (const ev of events) {
          bus.publish(ev.type, ev.payload);
        }
      }
    }

    cursors.set(path, { offset: newOffset, tracker });
  } finally {
    await fd.close();
  }
}
