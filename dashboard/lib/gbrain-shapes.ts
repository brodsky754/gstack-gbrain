// Pure adapters from raw `gbrain call` output to the dashboard's types.
//
// The dashboard's types (lib/types.ts) name edges {source, target, type} and
// give every entity a link_count. gbrain does not: `traverse_graph` returns
// rows shaped {from_slug, to_slug, link_type, context, depth} and `list_pages`
// returns {slug, type, title, updated_at} with no link_count (checked against
// gbrain 0.32.0 and 0.60.342.0). Passing those through untouched meant the
// graph pane dropped every edge, node radii were NaN, and Ship This traced
// `undefined` slugs. Everything gbrain returns goes through here first.
//
// No Node imports: unit-tested directly.

import type { BrainEdge, BrainEntity } from './types';

type Row = Record<string, unknown>;

function isRow(v: unknown): v is Row {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Unwrap `[...]` or `{ <key>: [...] }`; anything else is an empty list. */
function rowsOf(res: unknown, key: string): unknown[] {
  if (Array.isArray(res)) return res;
  if (isRow(res) && Array.isArray(res[key])) return res[key] as unknown[];
  return [];
}

/** traverse_graph output -> BrainEdge[]. Rows without both endpoints are dropped. */
export function normalizeEdges(res: unknown): BrainEdge[] {
  const out: BrainEdge[] = [];
  for (const row of rowsOf(res, 'edges')) {
    if (!isRow(row)) continue;
    const source = str(row.source) ?? str(row.from_slug) ?? str(row.from);
    const target = str(row.target) ?? str(row.to_slug) ?? str(row.to);
    if (!source || !target) continue;
    const type = str(row.type) ?? str(row.link_type) ?? 'mentions';
    out.push({ source, target, type });
  }
  return out;
}

/** list_pages output -> BrainEntity[]. link_count defaults to 0, never undefined. */
export function normalizeEntities(res: unknown): BrainEntity[] {
  const out: BrainEntity[] = [];
  for (const row of rowsOf(res, 'pages')) {
    if (!isRow(row)) continue;
    const slug = str(row.slug);
    if (!slug) continue;
    const linkCount = typeof row.link_count === 'number' && Number.isFinite(row.link_count)
      ? row.link_count
      : 0;
    out.push({
      slug,
      title: str(row.title) ?? slug,
      type: str(row.type) ?? 'unknown',
      link_count: linkCount,
    });
  }
  return out;
}

/**
 * Fill in link_count from the edges we fetched (in + out degree) for any node
 * gbrain did not give a count for.
 */
export function withDegree(nodes: BrainEntity[], edges: BrainEdge[]): BrainEntity[] {
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
  }
  return nodes.map((n) => (n.link_count > 0 ? n : { ...n, link_count: degree.get(n.slug) ?? 0 }));
}

/** String slugs from a meeting page's `attendees` frontmatter. */
export function attendeeSlugs(frontmatter: unknown): string[] {
  if (!isRow(frontmatter) || !Array.isArray(frontmatter.attendees)) return [];
  return frontmatter.attendees.filter((a): a is string => typeof a === 'string' && a.length > 0);
}
