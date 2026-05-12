# gstack-gbrain

A starter that combines two open-source projects from [Garry Tan](https://x.com/garrytan):

- **[gstack](https://github.com/garrytan/gstack)** — a Claude Code skills package that turns Claude Code into a virtual engineering team (CEO, eng manager, designer, reviewer, QA, security officer, release engineer — 23+ specialists as slash commands).
- **[gbrain](https://github.com/garrytan/gbrain)** — a persistent knowledge brain for AI agents (PGLite or Postgres + pgvector, hybrid search, self-wiring knowledge graph, 30+ MCP tools).

They're naturally complementary:

> **gstack teaches the agent how to ship. gbrain teaches it what it already knows.**

This repo wires them together so a single Claude Code session can plan, review, QA, and ship code (gstack) while persisting memory and retrieving prior context across sessions (gbrain over MCP).

Neither submodule is forked or modified. Both stay pinned to upstream master; pull updates with `git submodule update --remote`.

## Quick start

Requirements: [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Bun](https://bun.sh/) v1.0+, [Git](https://git-scm.com/).

```bash
git clone --recurse-submodules https://github.com/brodsky754/gstack-gbrain.git
cd gstack-gbrain
./bootstrap.sh
```

The bootstrap script:

1. Initializes/updates both submodules.
2. Runs `gstack/setup` to install gstack at `~/.claude/skills/gstack` (or symlinks it from this checkout for live development).
3. Runs `bun install && bun link` in `gbrain/` so the `gbrain` CLI is on your PATH.
4. Runs `gbrain init` (defaults to PGLite, no Postgres server needed) if no brain exists at `~/.gbrain/`.
5. Prints the snippet to add to your Claude Code MCP config so `gbrain` is reachable as an MCP server.

You already cloned without `--recurse-submodules`? Run `git submodule update --init --recursive` first, then `./bootstrap.sh`.

## How they fit together

Inside a Claude Code session, with both installed:

| You want to                         | gstack does                                              | gbrain does                                                  |
|-------------------------------------|----------------------------------------------------------|--------------------------------------------------------------|
| Plan a feature                      | `/office-hours` then `/autoplan`                         | Looks up prior decisions, related people, past trade-offs    |
| Implement and ship                  | `/autoplan` → implement → `/ship`                        | Writes a page about what shipped so the next session sees it |
| Review a PR                         | `/review`                                                | Pulls context on the files/areas touched                     |
| Audit security                      | `/cso`                                                   | Reads prior audit findings, known weak points                |
| QA a staging URL                    | `/qa <url>`                                              | Logs the bugs found, links to the deploy                     |
| Retrospective across projects       | `/retro`                                                 | Provides the structured timeline                             |

The bridge is the gbrain MCP server. gstack skills don't *require* gbrain — they degrade gracefully — but when both are present, anything Claude Code learns (in a `/retro`, after a `/ship`, during an `/investigate`) can be filed into gbrain and surface again on the next session.

## What this repo is, and is not

**It is:**
- A two-submodule wrapper that installs and wires both tools.
- A `CLAUDE.md` that tells Claude Code where each lives and when to use which.
- A bootstrap script that handles the install dance.

**It is not:**
- A fork of either project. The submodules track upstream `master`.
- A replacement for `~/.claude/skills/gstack` or `~/.gbrain/`. Those still live in their canonical locations after bootstrap.
- A trading bot, agent framework, or anything beyond an integration starter.

## Layout

```
gstack-gbrain/
├── README.md          # this file
├── CLAUDE.md          # session-level instructions for Claude Code
├── AGENTS.md          # equivalent for non-Claude agents (Codex, Cursor, etc.)
├── bootstrap.sh       # one-shot installer
├── examples/          # example workflows that exercise both
│   └── README.md
├── gstack/            # submodule -> github.com/garrytan/gstack
└── gbrain/            # submodule -> github.com/garrytan/gbrain
```

## Updating

```bash
git submodule update --remote --merge   # pull latest gstack + gbrain
./bootstrap.sh                          # re-run to pick up any new setup steps
```

`gstack`'s own auto-update path (`./setup --team`) also works; this repo doesn't get in its way.

## Credit

All real work in `gstack/` and `gbrain/` is by [Garry Tan](https://github.com/garrytan) and the gstack/gbrain contributors. This repo is just glue. License of each submodule applies to its contents (both MIT).

The glue files in this top-level (README, CLAUDE.md, AGENTS.md, bootstrap.sh) are MIT.
