# gstack-gbrain — session instructions for Claude Code

This repo combines two upstream projects as git submodules:

- `gstack/` — Claude Code skills package. Install target: `~/.claude/skills/gstack`.
- `gbrain/` — Persistent knowledge brain + MCP server. Install target: `~/.gbrain/` (data) + global `gbrain` CLI.

After `./bootstrap.sh` runs, both are installed in their canonical locations on disk. This file tells you how to use them together in a session.

## What lives where

| Component               | Where it lives                    | How you invoke it                                  |
|-------------------------|-----------------------------------|----------------------------------------------------|
| gstack skills           | `~/.claude/skills/gstack/`        | Slash commands: `/office-hours`, `/ship`, `/review`, `/qa`, `/cso`, `/autoplan`, `/retro`, `/investigate`, `/canary`, `/benchmark`, `/codex`, `/careful`, `/freeze`, etc. |
| gbrain CLI              | global `gbrain` on PATH           | `gbrain query "..."`, `gbrain put-page`, `gbrain stats`, `gbrain doctor`, ~47 ops total. |
| gbrain MCP server       | `gbrain serve` (stdio)            | Configured in Claude Code's MCP config as the `gbrain` server. Surfaces 30+ tools (`query`, `search`, `get_page`, `put_page`, `list_pages`, `find_orphans`, etc.). |
| Brain data              | `~/.gbrain/`                      | Read/write via the CLI or MCP server. Don't edit files directly. |

The two submodule directories under this repo (`gstack/`, `gbrain/`) are the **source** for those installs. After bootstrap, you do not normally need to touch them — work happens via the slash commands and MCP tools.

## Default routing rules

When the user's request matches a gstack slash command, **invoke the skill first.** Do not hand-roll. The skills have specialized workflows that produce better results than ad-hoc answers. Key matches:

- "Ship this", "push and ship", "create a PR" → `/ship`
- "Review this branch / PR / diff" → `/review`
- "Plan this feature", "is this worth building" → `/office-hours` then `/autoplan`
- "Why is this broken", "500 error", "debug this" → `/investigate`
- "Security audit", "OWASP", "STRIDE" → `/cso`
- "QA the site", "test this URL" → `/qa <url>`
- "Architecture review" → `/plan-eng-review`
- "Update docs after shipping" → `/document-release`
- "Weekly retro" → `/retro`

When the user's request is about **memory, recall, or prior context**, reach for gbrain:

- "What do I know about <topic>?" → `gbrain query "<topic>"` (or the `query` MCP tool)
- "Who attended that meeting?", "what did <person> say about <X>?" → `gbrain query` with the person's slug
- "File this away", "remember this" → `put_page` MCP tool with a sensible slug
- "What's connected to <X>?" → `gbrain graph-query <slug>` (or `get_page` followed by reading its links)
- "Find orphan pages", "audit the brain" → `gbrain orphans` and `gbrain doctor`

Routing for combined requests: a `/ship` that should also be remembered → run `/ship` first, then file a brain page describing what shipped and why. A debugging session that surfaces a recurring failure mode → `/investigate` first, then file the root cause as a brain page so it surfaces in future investigations.

## Memory-first lookup

Before answering any factual question about the user's work, contacts, prior decisions, or projects: **query the brain first.** gbrain is the persistent layer; this session is ephemeral.

```
gbrain query "<question>" --json
```

Cheap (sub-second on a warm brain). Skip only when the question is obviously not in any brain (current weather, definition of a public API).

## Filing rules (when writing to the brain)

If you put pages into the brain in this session, follow gbrain's filing conventions:

- **People** → `people/<first-last>`
- **Companies** → `companies/<name>`
- **Projects** → `projects/<name>`
- **Concepts / writing** → `concepts/<slug>` or `writing/<slug>`
- **Meetings** → `meetings/YYYY-MM-DD-<attendees-or-topic>`
- **Deals** → `deals/<company>-<round>`

Don't invent new top-level namespaces without checking `~/.gbrain/` for the established structure. `skills/_brain-filing-rules.md` inside the `gbrain/` submodule is the canonical reference.

Every page write should:
1. Use frontmatter (YAML).
2. Include backlinks to related entities (gbrain auto-extracts these on write, but explicit `[Name](people/slug)` references help).
3. Have a clear `title:` and `type:` field.

## When the user is iterating on gstack or gbrain themselves

If the user is **developing** gstack or gbrain (editing the submodules), respect each project's own `CLAUDE.md`:

- `gstack/CLAUDE.md` — covers skill template generation, `bun run gen:skill-docs`, evals, slop-scan, etc.
- `gbrain/CLAUDE.md` — covers the contract-first operations, engine factory, BrainBench, migration registry, etc.

This top-level `CLAUDE.md` is the integration layer. The submodule-level ones are authoritative for their own internals.

## What this repo does NOT do

- Does **not** maintain its own version, CHANGELOG, or release process. The submodules each have their own.
- Does **not** patch either submodule. If you want to fix gstack or gbrain, send a PR upstream.
- Does **not** vendor a brain. `~/.gbrain/` is the user's personal brain and is never committed here.

## Bootstrap re-run

If anything looks broken after a `git pull` or `git submodule update`:

```bash
./bootstrap.sh
```

It's idempotent — safe to re-run. It updates the global gstack install, re-links gbrain if needed, and re-prints the MCP snippet.
