# gstack↔gbrain remote

> Your AI's memory and your AI's actions, one click apart.

A local-first dashboard at `localhost:3000` that wires [gstack](https://github.com/garrytan/gstack)'s skill execution to [gbrain](https://github.com/garrytan/gbrain)'s knowledge layer. Brief Me pulls today's context from the brain. Ship This launches a gstack `/office-hours` session in any repo with a brain page pre-loaded as context. The d3-force graph reacts live as the agent reads entities.

**Built as a hackathon submission. Intended for upstream as `gstack-hud` — a community contribution to gstack.**

## What's in the demo

Four beats, each 30–90 seconds:

1. **Graph pulses.** Open `localhost:3000`. Force graph renders ~50 top entities from the brain.
2. **Brief Me.** Click. Card stack of today's meetings + linked people + open threads.
3. **Live session pane.** A running `claude` session ticks token spend; graph node for the entity it's currently reading pulses violet.
4. **Ship This.** Click on any brain-page card. Lineage animates on the graph, Terminal opens in the chosen repo, `/office-hours brain-page:<slug>` is on your clipboard. Cmd+V, enter.

See [DEMO.md](./DEMO.md) for the exact narration.

## Setup

```bash
# from this repo root
./bootstrap.sh             # installs gstack + gbrain globally (parent README)

cd dashboard
bun install
bun run dev                # localhost:3000
```

Prerequisites:
- [Bun](https://bun.sh) v1.1+
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (for the GSTACK session pane to have anything to read)
- `gbrain` on PATH (`./bootstrap.sh` handles this)
- macOS for the Ship This handoff in v1 (osascript + Terminal.app). Linux/Windows is a v2 follow-up.

## Architecture

See [`../docs/designs/2026-05-12-mission-control-dashboard.md`](../docs/designs/2026-05-12-mission-control-dashboard.md) for the full plan (office-hours → CEO review → eng review → design review).

In short:

```
Browser (Next.js 14 + Tailwind, dark mode, two-pane split)
   │
   │   SSE from /api/events  (last-event-id replay for reconnect)
   ▼
Next.js server (Bun)
   │
   ├── instrumentation.ts boots:
   │     • probes `gbrain --version`
   │     • starts sessionPoller (~/.claude/projects/*/sessions/*.jsonl, 2s)
   │     • publishes events to an in-process bus (50-event ring buffer)
   │
   ├── Server actions / route handlers:
   │     • /api/brief  → gbrain CLI subprocess + emits zoom_to
   │     • /api/ship   → emits trace_lineage + clipboard + osascript Terminal
   │     • /api/graph  → gbrain CLI subprocess for top-N entities + edges
   │
   └── lib/ (tested at ~70% coverage):
         event-bus.ts, gbrain-client.ts, jsonl-parser.ts,
         sse-emitter.ts, ship-this.ts, session-poller.ts
```

## Tests

```bash
bun test            # all adapter tests
bun test --watch    # iterate
```

Covered:
- `event-bus.ts` — publish, subscribe, replay, ring buffer cap, throwing-subscriber tolerance
- `jsonl-parser.ts` — parse line variants, slug extraction (all 9 prefixes), case normalization, fixture round-trip, partial-line tolerance
- `ship-this.ts` — command construction, osascript injection guard (rejects `; rm -rf /`, `$(...)`, backticks, embedded quotes, backslashes)

Not covered in v1: UI components (hackathon-honest), `gbrain-client.ts` subprocess wrapper (would need spawn mocking; defer to E2E).

## Cuts from the original brief (see design doc for why)

- **Diff view of compiled-truth vs timeline appends** — hardest feature, not demo-able.
- **Unified signal inbox** — empty on stage unless artificially staged.
- **Manual capture box** — terminal `gbrain put-page` wins.
- **100% test coverage** — hackathon doesn't value it; 70% on adapters is honest.
- **"Start new session" launcher** — typing `claude` in a terminal is faster.

## What you'll fill in during the hackathon

Skeletons are wired and tests pass. The hackathon clock is for:

1. **`lib/gbrain-client.ts`** — confirm exact CLI flag for `--sort link_count_desc`; if missing, fall back to a graph_query pass.
2. **`app/_components/GraphPane.tsx`** — wire `zoomToSlugs()` and `animateTrace()` to actual `d3.zoom().transform()` calls + node-highlight sequence (left as `intentionally empty` stubs).
3. **`app/api/brief/route.ts`** — refine the "open threads" query against your actual brain-filing convention.
4. **Visual polish** — card shadows, animations, demo-recording readability.

## Upstream PR intent

After the hackathon, this surfaces as `gstack-hud`: a top-level skill in `~/.claude/skills/gstack/hud/` plus a Next.js companion app. The PR will:
- Move the `dashboard/` code under a new `hud/` skill in the gstack repo
- Add a `/hud` slash command that launches the local server
- Document the gbrain dependency as optional (HUD degrades to GSTACK-only mode if gbrain isn't on PATH)

PR target: `garrytan/gstack`, after the hackathon ships.
