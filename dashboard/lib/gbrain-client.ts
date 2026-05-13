// Subprocess wrapper around the `gbrain` CLI.
// One spawn per call; ~50ms overhead. Acceptable at single-user load.
// All output is JSON; CLI invocation uses `--json` flag where supported.

// Server-side only. Don't import from client components. Webpack edge-runtime
// fallbacks in next.config.js prevent this file from being bundled for the
// client/edge build paths.
import { spawn } from 'child_process';
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

export class GBrainError extends Error {
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
  // gbrain stats --json shape verified against v0.32.0 help.
  return run<BrainStats>(['stats', '--json']);
}

/**
 * Returns the brain's overall state so the dashboard can show accurate
 * empty-state messaging.
 *
 *   absent         — gbrain binary not on PATH
 *   uninitialized  — gbrain on PATH but no brain at ~/.gbrain (need `gbrain init`)
 *   empty          — brain exists but page_count is 0
 *   has_data       — brain has pages (may or may not have entity pages — graph
 *                    component decides separately based on its node count)
 */
export type BrainState = 'absent' | 'uninitialized' | 'empty' | 'has_data';

export async function getBrainState(): Promise<{ state: BrainState; stats?: BrainStats; reason?: string }> {
  const probeResult = await probe();
  if (!probeResult.ok) return { state: 'absent', reason: probeResult.error };

  try {
    const stats = await getStats();
    if (stats.page_count === 0) return { state: 'empty', stats };
    return { state: 'has_data', stats };
  } catch (err) {
    // gbrain prints "No brain configured. Run: gbrain init" to stderr on
    // uninitialized installs (exit code 1). GBrainError keeps stderr as a
    // separate property, so search both for the marker string.
    const message = (err as Error).message;
    const stderr = err instanceof GBrainError ? err.stderr ?? '' : '';
    const combined = `${message}\n${stderr}`;
    if (combined.includes('No brain configured') || combined.includes('gbrain init')) {
      return { state: 'uninitialized', reason: stderr.trim() || message };
    }
    return { state: 'absent', reason: stderr.trim() || message };
  }
}

export async function getPage(slug: string): Promise<BrainPage | null> {
  try {
    return await run<BrainPage>(['get', slug, '--json']);
  } catch (err) {
    if (err instanceof GBrainError &&
        (err.message.includes('not_found') || err.message.includes('No page'))) {
      return null;
    }
    throw err;
  }
}

export async function query(text: string, limit = 10): Promise<QueryResult[]> {
  // `gbrain query <q>` runs hybrid search with RRF + expansion. --no-expand
  // for deterministic results; we leave expansion on by default.
  const res = await run<{ results: QueryResult[] }>([
    'query', text, '--limit', String(limit), '--json',
  ]);
  return res.results ?? [];
}

/**
 * Returns recently-touched entity pages (people, companies, projects, concepts).
 * Renamed from the original "top-most-linked" plan because gbrain's `list` has
 * no `--sort link_count_desc` option (verified against v0.32.0 help). For
 * daily-use, "recently active" is a more useful signal anyway than "most linked
 * over all time" — the dashboard surfaces what you're thinking about now.
 */
export async function listTopEntities(limit = 50): Promise<BrainEntity[]> {
  const ENTITY_TYPES = ['person', 'company', 'project', 'concept'] as const;
  const perType = Math.max(5, Math.ceil(limit / ENTITY_TYPES.length));
  const results = await Promise.all(
    ENTITY_TYPES.map(async (type) => {
      try {
        const r = await run<{ pages: BrainEntity[] } | BrainEntity[]>([
          'list', '--type', type, '--sort', 'updated_desc', '--limit', String(perType), '--json',
        ]);
        // gbrain CLI sometimes returns `{ pages: [...] }` and sometimes a bare
        // array depending on the command. Handle both.
        return Array.isArray(r) ? r : (r.pages ?? []);
      } catch {
        return [];
      }
    }),
  );
  return results.flat().slice(0, limit);
}

export async function listEdges(slugs: string[]): Promise<BrainEdge[]> {
  if (slugs.length === 0) return [];
  // graph-query each slug, depth 1 → collect outgoing edges. Failures per-slug
  // are tolerated; the graph survives partial data.
  const allEdges: BrainEdge[] = [];
  for (const slug of slugs) {
    try {
      const res = await run<{ edges: BrainEdge[] } | BrainEdge[]>([
        'graph-query', slug, '--depth', '1', '--json',
      ]);
      const edges = Array.isArray(res) ? res : (res.edges ?? []);
      allEdges.push(...edges);
    } catch {
      // Skip individual failures.
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

/**
 * Today's meetings. gbrain's `list` uses `--updated-after` (not
 * `--created-after`); newly-created pages have updated_at == created_at, so
 * this catches today's meetings as long as they aren't being edited
 * retroactively. Caller can post-filter on frontmatter.date if stricter
 * "created today" semantics are needed.
 */
export async function listMeetingsToday(): Promise<BrainPage[]> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const res = await run<{ pages: BrainPage[] } | BrainPage[]>([
    'list', '--type', 'meeting',
    '--updated-after', today,
    '--json',
  ]);
  return Array.isArray(res) ? res : (res.pages ?? []);
}
