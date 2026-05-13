// Subprocess wrapper around the `gbrain` CLI.
// One spawn per call; ~50ms overhead. Acceptable at single-user load.
// All output is JSON; CLI invocation uses `--json` flag where supported.

import { spawn } from 'node:child_process';
import type {
  BrainStats,
  BrainPage,
  BrainEntity,
  BrainEdge,
  GraphSnapshot,
  QueryResult,
} from './types';

const GBRAIN_BIN = process.env.GBRAIN_BIN || 'gbrain';
const DEFAULT_TIMEOUT_MS = 15_000;

class GBrainError extends Error {
  constructor(message: string, public readonly stderr?: string) {
    super(message);
    this.name = 'GBrainError';
  }
}

interface RunOpts {
  timeoutMs?: number;
}

/**
 * Spawn gbrain with args, return parsed JSON stdout.
 * Throws GBrainError on non-zero exit or invalid JSON.
 */
async function run<T = unknown>(args: string[], opts: RunOpts = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn(GBRAIN_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new GBrainError(`gbrain ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf-8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf-8'); });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new GBrainError(
          `gbrain binary not found on PATH (looked for "${GBRAIN_BIN}"). ` +
          `Run ./bootstrap.sh in the repo root, or set GBRAIN_BIN env var.`,
          stderr,
        ));
        return;
      }
      reject(new GBrainError(`gbrain spawn error: ${err.message}`, stderr));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new GBrainError(`gbrain exited with code ${code}`, stderr));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as T);
      } catch (err) {
        reject(new GBrainError(
          `gbrain returned non-JSON output: ${stdout.slice(0, 200)}...`,
          stderr,
        ));
      }
    });
  });
}

/** Probe gbrain availability + version. Use at server boot. */
export async function probe(): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(GBRAIN_BIN, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf-8'); });
    child.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf-8'); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      resolve({ ok: false, error: err.code === 'ENOENT' ? 'gbrain not on PATH' : err.message });
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, version: stdout.trim() });
      } else {
        resolve({ ok: false, error: stderr.trim() || `exit code ${code}` });
      }
    });
  });
}

// ---------- High-level operations ----------

export async function getStats(): Promise<BrainStats> {
  return run<BrainStats>(['stats', '--json']);
}

export async function getPage(slug: string): Promise<BrainPage | null> {
  try {
    return await run<BrainPage>(['get-page', slug, '--json']);
  } catch (err) {
    if (err instanceof GBrainError && err.message.includes('not_found')) return null;
    throw err;
  }
}

export async function query(text: string, limit = 10): Promise<QueryResult[]> {
  const res = await run<{ results: QueryResult[] }>([
    'query', text, '--limit', String(limit), '--json',
  ]);
  return res.results ?? [];
}

export async function listTopEntities(limit = 50): Promise<BrainEntity[]> {
  // Pulls top-N most-linked entities. Implementation: gbrain list-pages
  // filtered to entity types, sorted by link_count desc.
  // TODO(hackathon): confirm exact CLI flag for "sort by link count".
  // If unavailable, fall back to listing entity pages and counting via a
  // second graph_query pass.
  const res = await run<{ pages: BrainEntity[] }>([
    'list-pages', '--type', 'person,company,project,concept',
    '--sort', 'link_count_desc', '--limit', String(limit), '--json',
  ]);
  return res.pages ?? [];
}

export async function listEdges(slugs: string[]): Promise<BrainEdge[]> {
  if (slugs.length === 0) return [];
  // graph-query each slug, collect edges. Hackathon: use --json --depth 1.
  const allEdges: BrainEdge[] = [];
  for (const slug of slugs) {
    try {
      const res = await run<{ edges: BrainEdge[] }>([
        'graph-query', slug, '--depth', '1', '--json',
      ]);
      allEdges.push(...(res.edges ?? []));
    } catch {
      // Skip individual failures; the graph survives partial data.
    }
  }
  return allEdges;
}

export async function getGraphSnapshot(limit = 50): Promise<GraphSnapshot> {
  const nodes = await listTopEntities(limit);
  const edges = await listEdges(nodes.map(n => n.slug));
  return {
    nodes,
    edges,
    generated_at: new Date().toISOString(),
  };
}

export async function listMeetingsToday(): Promise<BrainPage[]> {
  // Definition (locked at design time): pages with type=meeting where
  // created_at falls on today's date in the local timezone.
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const res = await run<{ pages: BrainPage[] }>([
    'list-pages', '--type', 'meeting',
    '--created-after', today,
    '--json',
  ]);
  return res.pages ?? [];
}

export { GBrainError };
