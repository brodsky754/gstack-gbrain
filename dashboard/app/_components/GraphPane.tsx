'use client';

// d3-force graph (2D). Renders the top-N most-linked entities.
// Subscribes to SSE:
//   - active_entity: pulse the node (live agent reading this slug)
//   - zoom_to:       smoothly recenter on a subset of slugs (Brief Me)
//   - trace_lineage: sequentially highlight nodes along an edge path (Ship This)

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { forceSimulation, forceLink, forceManyBody, forceCenter } from 'd3-force';
import type { GraphSnapshot, BrainEntity, BrainEdge } from '@/lib/types';

interface Node extends d3.SimulationNodeDatum {
  slug: string;
  title: string;
  type: string;
  link_count: number;
  active?: boolean;
  faded?: boolean;
}

interface Edge extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  type: string;
  highlighted?: boolean;
}

export function GraphPane({ initialSnapshot }: { initialSnapshot: GraphSnapshot | null }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [snapshot] = useState<GraphSnapshot | null>(initialSnapshot);
  const activeSlugs = useRef<Set<string>>(new Set());
  const traceQueue = useRef<{ slugs: string[]; until: number } | null>(null);

  // Live updates via SSE.
  useEffect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('active_entity', (e) => {
      const payload = JSON.parse(e.data) as { slug: string };
      activeSlugs.current.add(payload.slug);
      // Auto-expire after 4s of no further activity.
      setTimeout(() => activeSlugs.current.delete(payload.slug), 4_000);
    });

    source.addEventListener('zoom_to', (e) => {
      const payload = JSON.parse(e.data) as { slugs: string[] };
      zoomToSlugs(payload.slugs);
    });

    source.addEventListener('trace_lineage', (e) => {
      const payload = JSON.parse(e.data) as { slugs: string[] };
      traceQueue.current = { slugs: payload.slugs, until: Date.now() + 1500 };
      animateTrace(payload.slugs);
    });

    return () => source.close();
  }, []);

  // Build + render the simulation once the snapshot is ready.
  useEffect(() => {
    if (!snapshot || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svg.node()!.clientWidth;
    const height = svg.node()!.clientHeight;

    const nodes: Node[] = snapshot.nodes.map((n) => ({ ...n }));
    const slugToNode = new Map(nodes.map((n) => [n.slug, n]));
    const edges: Edge[] = snapshot.edges
      .filter((e) => slugToNode.has(e.source) && slugToNode.has(e.target))
      .map((e) => ({ ...e }));

    const sim = forceSimulation<Node>(nodes)
      .force('charge', forceManyBody().strength(-120))
      .force('center', forceCenter(width / 2, height / 2))
      .force(
        'link',
        forceLink<Node, Edge>(edges)
          .id((d) => d.slug)
          .distance(80)
          .strength(0.7),
      )
      .alpha(1);

    const root = svg
      .append('g')
      .attr('class', 'root');

    // Zoom/pan.
    const zoom = d3.zoom<SVGSVGElement, unknown>()
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
      .text((d) => d.title.length > 24 ? d.title.slice(0, 22) + '…' : d.title)
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

    // After settling, freeze the simulation. Re-warm on demand for zoom_to.
    sim.on('end', () => sim.alpha(0));

    // Pulse loop — paints active-entity highlights every animation frame.
    let rafId = 0;
    const paint = () => {
      const active = activeSlugs.current;
      nodeSel.select('circle')
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
    };

    // TODO(hackathon): wire zoomToSlugs() + animateTrace() to drive `root.transition()`
  }, [snapshot]);

  // Stub: real impl during hackathon. Uses d3.zoom().transform on the SVG.
  function zoomToSlugs(_slugs: string[]) {
    // intentionally empty — fill in during hackathon
  }
  function animateTrace(_slugs: string[]) {
    // intentionally empty — fill in during hackathon
  }

  if (!snapshot) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-text-muted text-sm">
          Graph unavailable — check gbrain status.
        </div>
      </div>
    );
  }

  return <svg ref={svgRef} className="w-full h-full" />;
}

function typeColor(type: string): string {
  switch (type) {
    case 'person': return '#a78bfa'; // violet (accent)
    case 'company': return '#4ade80'; // green
    case 'project': return '#fbbf24'; // yellow
    case 'concept': return '#60a5fa'; // blue
    default: return '#6b6b75'; // gray
  }
}
