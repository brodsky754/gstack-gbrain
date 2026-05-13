// Subprocess wrapper around the `gbrain` CLI's machine-readable interface.
//
// gbrain has two surfaces:
//   - CLI commands (`gbrain list`, `gbrain stats`, ...) — human-formatted
//     output, --json flags inconsistently honored.
//   - `gbrain call <tool> '<json>'` — canonical MCP-tool invocation,
//     returns JSON, stable contract. THIS is what we use.
//
// Tool names + shapes verified against `gbrain --tools-json` on v0.32.0.
//
// Server-side only — see next.config.js webpack fallback for the
// client/edge isolation.

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

interface SpawnOpts {
  timeoutMs?: number;
}

/**
 * Run a gbrain subprocess and parse stdout as JSON.
 * gbrain prints stderr warnings (ai.gateway notices, deprecation hints) that
 * don't affect stdout JSON parsing.
 */
async function spawnGbrain<T = unknown>(args: string[], opts: SpawnOpts = {}): Promise<T> {
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
      // gbrain call returns clean JSON on stdout, possibly preceded by ai.gateway
      // warnings (those go to stderr). Try to JSON.parse; if that fails, try
      // extracting the JSON block from the output.
      try {
        resolve(JSON.parse(stdout) as T);
      } catch {
        // Fallback: grab the first {...} or [...] block in case anything
        // accidentally landed on stdout alongside the JSON.
        const match = stdout.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
          try {
            resolve(JSON.parse(match[1]) as T);
            return;
          } catch {
            // fall through to reject
          }
        }
        reject(new GBrainError(
          `gbrain returned non-JSON output (first 200 chars): ${stdout.slice(0, 200)}`,
          stderr,
        ));
      }
    });
  });
}

/**
 * The canonical machine-readable entrypoint. `gbrain call <tool_name> '<args_json>'`
 * always returns JSON shaped to the tool's contract (verified against
 * `gbrain --tools-json`).
 */
async function callTool<T = unknown>(tool: string, args: object = {}, opts: SpawnOpts = {}): Promise<T> {
  return spawnGbrain<T>(['call', tool, JSON.stringify(args)], opts);
}

// ---------- Probe + state ----------

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
      if (code === 0) resolve({ ok: true, version: stdout.trim() });
      else resolve({ ok: false, error: stderr.trim() || `exit code ${code}` });
    });
  });
}

export type BrainState = 'absent' | 'uninitialized' | 'empty' | 'has_data';

export async function getBrainState(): Promise<{ state: BrainState; stats?: BrainStats; reason?: string }> {
  const probeResult = await probe();
  if (!probeResult.ok) return { state: 'absent', reason: probeResult.error };

  try {
    const stats = await getStats();
    if (stats.page_count === 0) return { state: 'empty', stats };
    return { state: 'has_data', stats };
  } catch (err) {
    const message = (err as Error).message;
    const stderr = err instanceof GBrainError ? err.stderr ?? '' : '';
    const combined = `${message}\n${stderr}`;
    // gbrain prints "No brain configured. Run: gbrain init" when ~/.gbrain has
    // no brain file. Match either substring to be robust to wording drift.
    if (combined.includes('No brain configured') || combined.includes('gbrain init')) {
      return { state: 'uninitialized', reason: stderr.trim() || message };
    }
    return { state: 'absent', reason: stderr.trim() || message };
  }
}

// ---------- Tool-backed data accessors ----------

export async function getStats(): Promise<BrainStats> {
  return callTool<BrainStats>('get_stats', {});
}

export async function getPage(slug: string): Promise<BrainPage | null> {
  try {
    return await callTool<BrainPage>('get_page', { slug });
  } catch (err) {
    if (err instanceof GBrainError) {
      const combined = `${err.message}\n${err.stderr ?? ''}`;
      if (combined.includes('not_found') || combined.includes('No page') || combined.includes('does not exist')) {
        return null;
      }
    }
    throw err;
  }
}

export async function query(text: string, limit = 10): Promise<QueryResult[]> {
  const res = await callTool<{ results?: QueryResult[] } | QueryResult[]>(
    'query',
    { query: text, limit },
  );
  if (Array.isArray(res)) return res;
  return res.results ?? [];
}

/**
 * Recently-touched entity pages, used as the graph's node set.
 *
 * gbrain's `list_pages` accepts ONE type at a time, so we fan out per-type
 * and union the results. Sort is `updated_desc` — "recently active" is a
 * more useful daily signal than "most-linked over all time."
 */
export async function listTopEntities(limit = 50): Promise<BrainEntity[]> {
  const ENTITY_TYPES = ['person', 'company', 'project', 'concept'] as const;
  const perType = Math.max(5, Math.ceil(limit / ENTITY_TYPES.length));
  const results = await Promise.all(
    ENTITY_TYPES.map(async (type) => {
      try {
        const r = await callTool<{ pages?: BrainEntity[] } | BrainEntity[]>(
          'list_pages',
          { type, limit: perType, sort: 'updated_desc' },
        );
        return Array.isArray(r) ? r : (r.pages ?? []);
      } catch {
        return [];
      }
    }),
  );
  return results.flat().slice(0, limit);
}

/**
 * Outgoing edges for the given slug set. Uses traverse_graph at depth 1.
 * Per-slug failures are tolerated so the graph survives partial data.
 */
export async function listEdges(slugs: string[]): Promise<BrainEdge[]> {
  if (slugs.length === 0) return [];
  const allEdges: BrainEdge[] = [];
  for (const slug of slugs) {
    try {
      // traverse_graph with no link_type/direction returns NODES (per docs).
      // We need EDGES. Pass `direction: 'out'` to get edges per the GraphPath
      // shape. If that doesn't yield edges, fall back to traversal-with-depth
      // approximation by using get_links.
      const res = await callTool<{ edges?: BrainEdge[] } | BrainEdge[]>(
        'traverse_graph',
        { slug, depth: 1, direction: 'out' },
      );
      const edges = Array.isArray(res) ? res : (res.edges ?? []);
      allEdges.push(...edges);
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

/**
 * Today's meetings. `list_pages` uses `updated_after` (ISO date or full
 * timestamp). Newly-created pages have updated_at == created_at, so this
 * catches today's meetings as long as they aren't being edited retroactively.
 */
export async function listMeetingsToday(): Promise<BrainPage[]> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const res = await callTool<{ pages?: BrainPage[] } | BrainPage[]>(
    'list_pages',
    { type: 'meeting', updated_after: today },
  );
  return Array.isArray(res) ? res : (res.pages ?? []);
}
