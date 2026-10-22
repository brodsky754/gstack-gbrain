import { describe, test, expect } from 'bun:test';
import {
  normalizeEdges,
  normalizeEntities,
  withDegree,
  attendeeSlugs,
} from '../lib/gbrain-shapes';

// Real `gbrain call` output captured from gbrain 0.32.0 and 0.60.342.0 (the
// two shapes are identical apart from the extra *_source_id fields in 0.60).
const TRAVERSE_OUT = [
  {
    from_slug: 'people/alice-example',
    from_source_id: 'default',
    to_slug: 'meetings/2026-10-22-alice',
    to_source_id: 'default',
    link_type: 'attended',
    context: 'frontmatter.attendees: people/alice-example',
    depth: 1,
  },
  {
    from_slug: 'companies/acme',
    to_slug: 'people/alice-example',
    link_type: 'mentions',
    context: 'Acme is a company.',
    depth: 1,
  },
];

const LIST_PAGES_OUT = [
  {
    slug: 'people/alice-example',
    source_id: 'default',
    type: 'person',
    title: 'Alice Example',
    updated_at: '2026-10-22T10:27:16.461Z',
  },
  { slug: 'companies/acme', type: 'company', title: 'Acme', updated_at: '2026-10-22T10:27:16.929Z' },
];

describe('normalizeEdges', () => {
  test('maps gbrain traverse_graph rows (from_slug/to_slug/link_type) to source/target/type', () => {
    // Regression: the graph pane filtered every edge out (e.source was
    // undefined) and Ship This traced `undefined` slugs.
    expect(normalizeEdges(TRAVERSE_OUT)).toEqual([
      { source: 'people/alice-example', target: 'meetings/2026-10-22-alice', type: 'attended' },
      { source: 'companies/acme', target: 'people/alice-example', type: 'mentions' },
    ]);
  });

  test('accepts the documented {edges: [...]} wrapper and already-normalized rows', () => {
    expect(normalizeEdges({ edges: [{ source: 'a', target: 'b', type: 'mentions' }] })).toEqual([
      { source: 'a', target: 'b', type: 'mentions' },
    ]);
  });

  test('drops rows with no usable endpoints instead of emitting undefined slugs', () => {
    expect(normalizeEdges([{ depth: 1 }, { from_slug: 'a' }, null, 'x'])).toEqual([]);
    expect(normalizeEdges(undefined)).toEqual([]);
  });

  test('missing link type falls back to "mentions"', () => {
    expect(normalizeEdges([{ from_slug: 'a', to_slug: 'b' }])).toEqual([
      { source: 'a', target: 'b', type: 'mentions' },
    ]);
  });
});

describe('normalizeEntities', () => {
  test('list_pages rows have no link_count: default it to 0, never undefined (NaN radius)', () => {
    const out = normalizeEntities(LIST_PAGES_OUT);
    expect(out).toEqual([
      { slug: 'people/alice-example', title: 'Alice Example', type: 'person', link_count: 0 },
      { slug: 'companies/acme', title: 'Acme', type: 'company', link_count: 0 },
    ]);
    for (const e of out) expect(Number.isFinite(5 + Math.min(e.link_count, 12))).toBe(true);
  });

  test('accepts the {pages: [...]} wrapper and keeps a provided link_count', () => {
    expect(normalizeEntities({ pages: [{ slug: 's', title: 'S', type: 'concept', link_count: 3 }] })).toEqual([
      { slug: 's', title: 'S', type: 'concept', link_count: 3 },
    ]);
  });

  test('a page with no title falls back to its slug; rows without a slug are dropped', () => {
    expect(normalizeEntities([{ slug: 'a/b', type: 'person' }, { title: 'no slug' }])).toEqual([
      { slug: 'a/b', title: 'a/b', type: 'person', link_count: 0 },
    ]);
  });
});

describe('withDegree', () => {
  test('fills link_count from the fetched edges when gbrain did not provide one', () => {
    const nodes = normalizeEntities(LIST_PAGES_OUT);
    const edges = normalizeEdges(TRAVERSE_OUT);
    expect(withDegree(nodes, edges).map((n) => [n.slug, n.link_count])).toEqual([
      ['people/alice-example', 2],
      ['companies/acme', 1],
    ]);
  });

  test('keeps a non-zero link_count reported by gbrain', () => {
    expect(withDegree([{ slug: 'a', title: 'A', type: 'person', link_count: 9 }], [])[0].link_count).toBe(9);
  });
});

describe('attendeeSlugs', () => {
  test('reads string attendees from frontmatter', () => {
    expect(attendeeSlugs({ attendees: ['people/a', 3, 'people/b'] })).toEqual(['people/a', 'people/b']);
  });

  test('missing or malformed frontmatter yields no attendees', () => {
    expect(attendeeSlugs(undefined)).toEqual([]);
    expect(attendeeSlugs({ attendees: 'people/a' })).toEqual([]);
  });
});
