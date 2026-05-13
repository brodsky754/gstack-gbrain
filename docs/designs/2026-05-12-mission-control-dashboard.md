# Mission Control Dashboard — design doc (office-hours output)

**Status:** scoped + CEO-reviewed (SELECTIVE EXPANSION), pending /plan-eng-review → /plan-design-review → /ship
**Owner:** Nate (brodsky754)
**Context:** hackathon project, 24–48 hr timebox
**Date:** 2026-05-12

## Thesis (revised by /plan-ceo-review)

**"The gstack↔gbrain remote — your AI's memory and your AI's actions, one click apart."**

NOT "mission control." Same code; sharper pitch. "Mission control" reads as another dashboard demo. The remote framing names the actual thesis: cross-cutting buttons that turn brain context into gstack actions.

## Positioning

Demo this as a community contribution to gstack (`gstack-hud`). The repo lives at `github.com/brodsky754/gstack-gbrain`; the hackathon submission frames it as "submitting upstream as a community add-on to gstack." No merge required before the demo — the *intent to upstream* is the story.

## Locked scope (Option B)

Local-first dashboard at `localhost:3000` combining gstack workflow visibility with gbrain knowledge layer:

1. **Brief Me** — pulls today's meetings + linked people pages + open threads from the brain, renders as a card stack. Single-click morning digest.
2. **Ship This** — on any brain page, launches a Terminal in the chosen repo with `/office-hours <slug>` pre-typed and the page attached as context. macOS-only in v1 (osascript handoff).
3. **GSTACK live session pane** — parses `~/.claude/projects/*/sessions/*.jsonl` for active sessions: which gstack skill is running, current phase, last tool call, token spend. Polled every 2s.
4. **GBRAIN slim pane + live d3-force graph** — `gbrain stats` summary tile + interactive graph of top-N most-linked entities, queried via the gbrain MCP server.

## Explicitly out of scope (cut by office-hours)

- Diff view (compiled truth vs timeline appends) — hardest feature, not demo-able
- Unified signal inbox — empty on stage unless artificially staged
- Manual "capture idea" box — terminal `gbrain put-page` wins
- 100% test coverage on data layer — hackathon doesn't value it; target ~70% on adapters
- "Start new session" launcher button — typing `claude` in a terminal is faster

## Constraints honored from original brief

- Local-first, no auth, no cloud, no telemetry
- Reads gstack state from filesystem (`~/.claude/projects/*/sessions/*.jsonl`)
- Talks to gbrain via MCP server + CLI subprocess
- Next.js + Tailwind + server components for data fetching; client components only where interactivity is required (graph, polling tickers)

## Pane linkage (added by /plan-ceo-review SELECTIVE EXPANSION)

The four features must light each other up. Same components, more wiring:

1. **Graph reacts to live sessions.** JSONL parser detects tool calls naming brain slugs; SSE channel pushes `active_entity: <slug>` events; graph node pulses live.
2. **Brief Me zooms the graph.** "Brief Me" handler emits `zoom_to: [slug1, slug2, ...]` for today's relevant entities. The brief and the graph are the same moment, two surfaces.
3. **Ship This traces lineage.** Before terminal handoff, emit `trace_lineage: [slug1, slug2, ...]` showing the chain of pages the spawned agent will read.

~200 LOC of wiring. ~3–4 extra hours.

## Time budget (revised)

- ~15–20 focused hours via CC + gstack on this machine
- Fits a 24–48 hr hackathon with sleep

## Demo flow (4 beats)

1. **0:00 — Graph pulses.** Open localhost:3000. Force graph renders ~50 top entities from gbrain.
2. **0:30 — Brief Me.** Click. Card stack of today's context renders inline.
3. **1:30 — GSTACK pane.** A pre-staged /ship session ticks token spend live.
4. **2:30 — Ship This.** Click on a brain page card. macOS Terminal pops with `/office-hours` pre-loaded. Live agent spawns.

## Architecture (locked by /plan-eng-review)

- **Framework:** Next.js 14 App Router + Tailwind, Bun runtime
- **Real-time:** SSE from `/api/events`, in-process event bus, 50-event ring buffer for reconnect replay
- **JSONL parser:** in-process 2s polling loop started in `instrumentation.ts`, brain-slug regex emits `active_entity` events
- **gbrain access:** CLI subprocess per call (`Bun.spawn(['gbrain', ...])`), ~50ms/call, JSON output
- **Graph:** d3-force 2D, 50 top-N entities, simulation freezes after layout, re-warms on `zoom_to`
- **Ship This:** clipboard + `osascript` to open Terminal in repo; toast says "press cmd+v + enter"
- **Test surface:** 70% on `dashboard/lib/*` adapters via Bun test; UI uncovered
- **Repo:** `dashboard/` at top level of `gstack-gbrain`; clean upstream-PR surface as `gstack-hud`

## Risks flagged

1. JSONL format drift (Claude Code updates) → per-line try/catch, never crash the poll loop
2. gbrain not on PATH → boot probe + banner pointing at `./bootstrap.sh`
3. Top-N entity query latency on large brains → cache + 60s refresh
4. d3-force perf >100 nodes → freeze after layout, re-warm on demand only
5. osascript Accessibility denial on first Ship This → fall back to clipboard-only path
6. "Today's meetings" data source ambiguity → choose meeting-type pages with `created_at` = today; document choice

## Design (locked by /plan-design-review)

- **Layout:** two-pane split. Left ~480px = Brief Me cards + GSTACK session pane below. Right = graph + GBRAIN slim tile + stats.
- **Mode:** dark default, `#0a0a0f` bg (matches gbrain admin)
- **Type:** Inter for UI, JetBrains Mono for slugs/tokens/timestamps; base 18px (projector-readable)
- **Accent:** violet primary `#a78bfa`
- **Status colors:** green (active), yellow (waiting), red (errored), gray (idle)
- **Animation choreography (3 beats only):** continuous pulse on active-entity nodes, zoom-to on Brief Me, sequential trace-lineage on Ship This. Nothing else animates.
- **Restraint:** no hover bounces, no card flips, no theme switcher, no mobile layout, no keyboard help overlay.
- **States:** skeleton-pulse loading, direct empty-state text, top-of-page error banner with actionable hints.

## All decisions locked

| Stage | Decision | Locked at |
|---|---|---|
| Scope | Option B + linkage wiring | /office-hours + /plan-ceo-review |
| Thesis | "The gstack↔gbrain remote" | /plan-ceo-review |
| Positioning | Future upstream contribution as `gstack-hud` | /plan-ceo-review |
| Framework | Next.js 14 + Tailwind + Bun | /plan-eng-review |
| Real-time | SSE + in-process event bus + 50-event replay ring | /plan-eng-review |
| gbrain access | CLI subprocess per call | /plan-eng-review (D4) |
| Ship This handoff | Clipboard + osascript Terminal open | /plan-eng-review (D5) |
| Layout | Two-pane split (cards left, graph right) | /plan-design-review (D6) |
| Animation | Pulse + zoom-to + trace-lineage; nothing else | /plan-design-review |
| Test coverage | ~70% on `dashboard/lib/*` adapters via Bun test; UI uncovered | /plan-eng-review |

## Build budget

- ~15–20 focused hours via CC + gstack on this machine
- Fits 24–48 hr hackathon with sleep

## What /ship gates on (when the code is written)

- All adapter tests pass (`bun test dashboard/`)
- `dashboard/lib/*` adapters at >=70% coverage
- README in `dashboard/` describes the upstream-PR intent
- One-page demo script committed at `dashboard/DEMO.md` walking the 4 beats
- VERSION + CHANGELOG bump
- PR title: "feat: gstack↔gbrain remote — local-first dashboard prototype"


- Is "dashboard" the right framing, or should the thesis be tighter (e.g., "the gstack↔gbrain remote")?
- Are the four features sufficiently linked, or do they feel like four separate widgets sharing a page?
- What's the one-sentence pitch and is it differentiated from other hackathon dashboards?
