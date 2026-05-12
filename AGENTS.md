# AGENTS.md

Non-Claude agents (Codex, Cursor, OpenClaw, Aider, etc.) read this file; Claude Code reads `CLAUDE.md`. Both files describe the same integration.

This repo combines [gstack](https://github.com/garrytan/gstack) and [gbrain](https://github.com/garrytan/gbrain) as git submodules.

## What you have access to

After `./bootstrap.sh` runs on the user's machine:

- **gstack skills** are installed at `~/.claude/skills/gstack/` and surface as slash commands inside Claude Code. If you are not Claude Code, you cannot invoke them directly — but you can read the skill markdown to understand the methodology and apply it yourself.
- **gbrain CLI** is on PATH globally. Useful commands:
  - `gbrain query "<question>"` — hybrid search over the brain.
  - `gbrain get-page <slug>` — read a specific page.
  - `gbrain list-pages --type <type>` — enumerate by category.
  - `gbrain put-page <slug> --content '<markdown>'` — write a page.
  - `gbrain stats` / `gbrain doctor` — brain health.
  - `gbrain --tools-json` — full op catalog.
- **gbrain MCP server** runs via `gbrain serve` (stdio). If your agent platform supports MCP, configure it as a server and you get ~30 tools (search, query, put_page, get_page, find_orphans, etc.) without shelling out.

## Recommended operating loop

1. **Before answering a factual question about the user's work:** run `gbrain query "<the question>"` and read the top results. The brain is the source of truth.
2. **Before starting non-trivial code work:** if `gstack/` is in this repo, read the relevant skill markdown (e.g. `gstack/review/SKILL.md` or `gstack/cso/SKILL.md`) for the methodology. Apply the steps even if you can't invoke the slash command directly.
3. **After finishing meaningful work:** file a brain page summarizing what happened (`gbrain put-page projects/<name>/<date>-<summary>`). The next session sees it.

## Trust boundary

- The brain data at `~/.gbrain/` may contain private notes, contacts, deal info. **Treat it as confidential.** Do not paste raw query results into public artifacts (PRs, issues, commit messages) without user review.
- Both submodules are MIT-licensed open source from upstream `garrytan/...`. This repo does not modify them.

## Updating the submodules

```bash
git submodule update --remote --merge
./bootstrap.sh
```

## Reading further

- `README.md` — project overview.
- `CLAUDE.md` — Claude Code-specific routing.
- `gstack/README.md` — gstack's own docs.
- `gbrain/README.md` and `gbrain/AGENTS.md` — gbrain's own docs (the AGENTS.md there is the non-Claude operating protocol for gbrain specifically).
