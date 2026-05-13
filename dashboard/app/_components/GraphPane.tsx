'use client';

// d3-force graph (2D). Renders the recently-touched entities from gbrain.
//
// SSE-driven interactions:
//   active_entity   — pulse the node (live agent reading this slug)
//   zoom_to         — fit a subset of slugs into ~70% of the viewport (Brief Me)
//   trace_lineage   — sequentially highlight nodes + edges along a path (Ship This)
//
// Architecture note: d3 owns its selections imperatively, so the simulation
// useEffect builds them once and stores them in refs. SSE handlers (in a
// separate useEffect) read the refs to drive zoom/highlight without forcing
// React to re-render. This is the conventional d3-in-React pattern.

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force';
import type { GraphSnapshot } from '@/lib/types';
import type { BrainState } from '@/lib/gbrain-client';

interface Node extends d3.SimulationNodeDatum {
  slug: string;
  title: string;
  type: string;
  link_count: number;
}

interface Edge extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  type: string;
}

interface GraphHandles {
  width: number;
  height: number;
  zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  nodeSel: d3.Selection<SVGGElement, Node, SVGGElement, unknown>;
  linkSel: d3.Selection<SVGLineElement, Edge, SVGGElement, unknown>;
  slugToNode: Map<string, Node>;
}

export function GraphPane({
  initialSnapshot,
  brainState = 'has_data',
}: {
  initialSnapshot: GraphSnapshot | null;
  brainState?: BrainState;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const handlesRef = useRef<GraphHandles | null>(null);
  const activeSlugs = useRef<Set<string>>(new Set());
  const [snapshot] = useState<GraphSnapshot | null>(initialSnapshot);

  // Build the simulation + initial render once when the snapshot is ready.
  useEffect(() => {
    if (!snapshot || snapshot.nodes.length === 0 || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const nodes: Node[] = snapshot.nodes.map((n) => ({ ...n }));
    const slugToNode = new Map(nodes.map((n) => [n.slug, n]));
    const edges: Edge[] = snapshot.edges
      .filter((e) => slugToNode.has(e.source) && slugToNode.has(e.target))
      .map((e) => ({ ...e }));

    const sim = forceSimulation<Node>(nodes)
      .force('charge', forceManyBody().strength(-140))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'link',
        forceLink<Node, Edge>(edges)
          .id((d) => d.slug)
          .distance(90)
          .strength(0.6),
      )
      .alpha(1);

    const root = svg.append('g').attr('class', 'root');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 4])
      .on('zoom', (e) => {
        root.attr('transform', e.transform.toString());
      });
    svg.call(zoom);

    const linkSel = root
      .append('g')
      .attr('class', 'links')
      .attr('stroke', '#26262e')
      .attr('stroke-width', 1)
      .attr('stroke-linecap', 'round')
      .selectAll<SVGLineElement, Edge>('line')
      .data(edges)
      .join('line');

    const nodeSel = root
      .append('g')
      .attr('class', 'nodes')
      .selectAll<SVGGElement, Node>('g.node')
      .data(nodes)
      .join('g')
      .attr('class', 'node');

    nodeSel
      .append('circle')
      .attr('r', (d) => 5 + Math.min(d.link_count, 12))
      .attr('fill', (d) => typeColor(d.type))
      .attr('stroke', '#0a0a0f')
      .attr('stroke-width', 1.5);

    nodeSel
      .append('text')
      .text((d) => (d.title.length > 24 ? d.title.slice(0, 22) + '…' : d.title))
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-size', 11)
      .attr('fill', '#a1a1aa')
      .attr('dx', 10)
      .attr('dy', 4);

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as Node).x ?? 0)
        .attr('y1', (d) => (d.source as Node).y ?? 0)
        .attr('x2', (d) => (d.target as Node).x ?? 0)
        .attr('y2', (d) => (d.target as Node).y ?? 0);
      nodeSel.attr('transform', (d) => `translate(${d.x ?? 0}, ${d.y ?? 0})`);
    });

    sim.on('end', () => sim.alpha(0));

    // Stash handles for SSE-driven interactions.
    handlesRef.current = { width, height, zoom, svg, nodeSel, linkSel, slugToNode };

    // Active-entity pulse paint loop — runs continuously, reads activeSlugs ref.
    let rafId = 0;
    const paint = () => {
      const active = activeSlugs.current;
      nodeSel.select<SVGCircleElement>('circle')
        .attr('stroke', (d) => (active.has(d.slug) ? '#a78bfa' : '#0a0a0f'))
        .attr('stroke-width', (d) => (active.has(d.slug) ? 3 : 1.5))
        .style('filter', (d) =>
          active.has(d.slug) ? 'drop-shadow(0 0 8px #a78bfa)' : 'none',
        );
      rafId = requestAnimationFrame(paint);
    };
    rafId = requestAnimationFrame(paint);

    return () => {
      cancelAnimationFrame(rafId);
      sim.stop();
      handlesRef.current = null;
    };
  }, [snapshot]);

  // SSE-driven imperative interactions. Reads handlesRef built by the
  // simulation useEffect above.
  useEffect(() => {
    const source = new EventSource('/api/events');

    const onActiveEntity = (e: MessageEvent) => {
      try {
        const { slug } = JSON.parse(e.data) as { slug: string };
        activeSlugs.current.add(slug);
        setTimeout(() => activeSlugs.current.delete(slug), 4_000);
      } catch {
        /* ignore malformed event */
      }
    };

    const onZoomTo = (e: MessageEvent) => {
      try {
        const { slugs } = JSON.parse(e.data) as { slugs: string[] };
        zoomToSlugs(handlesRef.current, slugs);
      } catch {
        /* ignore */
      }
    };

    const onTraceLineage = (e: MessageEvent) => {
      try {
        const { slugs } = JSON.parse(e.data) as { slugs: string[] };
        animateTrace(handlesRef.current, slugs);
      } catch {
        /* ignore */
      }
    };

    source.addEventListener('active_entity', onActiveEntity);
    source.addEventListener('zoom_to', onZoomTo);
    source.addEventListener('trace_lineage', onTraceLineage);

    return () => {
      source.close();
    };
  }, []);

  // ----- Empty-state handling — pick the right message for the actual state -----

  if (brainState === 'absent') {
    return (
      <EmptyState
        title="gbrain not detected"
        message="The dashboard couldn't find the gbrain CLI on PATH. Run ./bootstrap.sh in the repo root, then refresh."
      />
    );
  }

  if (brainState === 'uninitialized') {
    return (
      <EmptyState
        title="No brain configured yet"
        message="Run `gbrain init` once to create a local PGLite brain (no Postgres server needed). Pick an embedding provider when prompted, then refresh this page."
      />
    );
  }

  if (brainState === 'empty') {
    return (
      <EmptyState
        title="Brain is empty"
        message="The brain exists but has no pages yet. Try `gbrain import ~/notes/` to ingest a markdown directory, or write a few pages with `gbrain put`, then refresh."
      />
    );
  }

  if (!snapshot || snapshot.nodes.length === 0) {
    return (
      <EmptyState
        title="No entity pages yet"
        message="The graph renders people / companies / projects / concepts. Your brain has pages but no entity-typed ones. Add some, or wait for the dream cycle to extract entities, then refresh."
      />
    );
  }

  return <svg ref={svgRef} className="w-full h-full" />;
}

// ---------- Imperative graph operations ----------

function zoomToSlugs(h: GraphHandles | null, slugs: string[]) {
  if (!h || slugs.length === 0) return;
  const matched = slugs
    .map((s) => h.slugToNode.get(s))
    .filter((n): n is Node => n !== undefined && typeof n.x === 'number' && typeof n.y === 'number');
  if (matched.length === 0) return;

  const xs = matched.map((n) => n.x as number);
  const ys = matched.map((n) => n.y as number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = 80;
  const bw = Math.max(maxX - minX + padding * 2, 200);
  const bh = Math.max(maxY - minY + padding * 2, 200);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  // Fit the bounding box into ~70% of viewport, cap at 3x scale.
  const k = Math.min((h.width * 0.7) / bw, (h.height * 0.7) / bh, 3);
  const tx = h.width / 2 - cx * k;
  const ty = h.height / 2 - cy * k;

  const transform = d3.zoomIdentity.translate(tx, ty).scale(k);
  h.svg.transition().duration(600).call(h.zoom.transform, transform);

  // Fade non-matched nodes during the focused view.
  const matchSet = new Set(matched.map((n) => n.slug));
  h.nodeSel
    .select<SVGCircleElement>('circle')
    .transition()
    .duration(400)
    .attr('opacity', (d) => (matchSet.has(d.slug) ? 1 : 0.25));
  h.nodeSel
    .select<SVGTextElement>('text')
    .transition()
    .duration(400)
    .attr('opacity', (d) => (matchSet.has(d.slug) ? 1 : 0.15));

  // Restore after 6 seconds. (Users can also pan/zoom manually to override.)
  setTimeout(() => {
    h.nodeSel.select<SVGCircleElement>('circle').transition().duration(600).attr('opacity', 1);
    h.nodeSel.select<SVGTextElement>('text').transition().duration(600).attr('opacity', 1);
  }, 6_000);
}

function animateTrace(h: GraphHandles | null, slugs: string[]) {
  if (!h || slugs.length === 0) return;

  // Step-stagger highlights along the consecutive-pairs path.
  const STEP_MS = 220;
  const HOLD_MS = 900;
  const ACCENT = '#a78bfa';

  // Highlight each node in sequence.
  slugs.forEach((slug, i) => {
    setTimeout(() => {
      const targetNode = h.nodeSel.filter((d) => d.slug === slug);
      targetNode
        .select<SVGCircleElement>('circle')
        .transition()
        .duration(160)
        .attr('r', (d) => (5 + Math.min(d.link_count, 12)) * 1.4)
        .style('filter', `drop-shadow(0 0 12px ${ACCENT})`)
        .transition()
        .duration(HOLD_MS)
        .attr('r', (d) => 5 + Math.min(d.link_count, 12))
        .style('filter', 'none');
    }, i * STEP_MS);
  });

  // Highlight edges between consecutive slugs.
  for (let i = 0; i < slugs.length - 1; i++) {
    const src = slugs[i];
    const tgt = slugs[i + 1];
    setTimeout(() => {
      h.linkSel
        .filter((e) => {
          const s = typeof e.source === 'string' ? e.source : e.source.slug;
          const t = typeof e.target === 'string' ? e.target : e.target.slug;
          // Trace is undirected — match either direction.
          return (s === src && t === tgt) || (s === tgt && t === src);
        })
        .transition()
        .duration(160)
        .attr('stroke', ACCENT)
        .attr('stroke-width', 2.5)
        .transition()
        .duration(HOLD_MS)
        .attr('stroke', '#26262e')
        .attr('stroke-width', 1);
    }, i * STEP_MS + STEP_MS / 2);
  }
}

// ---------- Visual helpers ----------

function typeColor(type: string): string {
  switch (type) {
    case 'person': return '#a78bfa';   // violet (accent)
    case 'company': return '#4ade80';  // green
    case 'project': return '#fbbf24';  // yellow
    case 'concept': return '#60a5fa';  // blue
    default: return '#6b6b75';
  }
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-12">
      <div className="card max-w-md text-center space-y-2">
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-text-muted">{message}</div>
      </div>
    </div>
  );
}
