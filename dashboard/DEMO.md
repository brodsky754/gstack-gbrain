# Demo script — 5 minutes

For a hackathon judge. Read once before stage, rehearse twice.

## Setup (do BEFORE the demo)

1. `./bootstrap.sh` has run; `gbrain --version` works; brain has at least one meeting page with `created_at: <today>` and at least 2 attendees.
2. In a separate terminal, start a long-running `claude` session in any repo. Run `/office-hours` so the session pane has something to display when you open the dashboard. Leave the session idle but alive.
3. `cd dashboard && bun run dev` — confirm `localhost:3000` loads cleanly.
4. Close any chat/notification apps. Mute the laptop. Plug in to projector.

## The pitch (15 seconds, before the click)

> "Two open-source projects from Garry Tan changed how I ship code this year. `gstack` is a skill pack that turns Claude Code into a virtual engineering team — `/office-hours`, `/ship`, `/review`, `/cso`. `gbrain` is a persistent knowledge brain — my agent's memory.
>
> The problem: they don't talk. Memory and action are separate workflows. This is the **gstack↔gbrain remote** — your AI's memory and your AI's actions, one click apart."

## Beat 1 — 0:00–0:30 — Graph pulses

Open `localhost:3000`. Let the silence land for ~3 seconds while the graph settles.

> "What you're looking at is every entity in my brain — people, companies, projects — laid out by how often they're linked. About 50 nodes here. Each one is a brain page my agent can read."

(Hover one node briefly so the judge sees the title.)

## Beat 2 — 0:30–1:30 — Brief Me

Click **Brief Me** in the upper-left card.

> "This pulls today's context from the brain — meetings on the calendar, the people I'm meeting, any open threads I'm tracking."

When cards render (~1–2s):

> "Watch the graph." (point to the right pane — graph zooms to today's relevant entities, surrounding nodes fade)

> "Same moment, two surfaces. The brief on the left is the same context the graph just narrowed to on the right."

## Beat 3 — 1:30–2:30 — Live GSTACK pane + active-entity pulse

Switch attention to the lower-left **GSTACK sessions** pane.

> "I have a `claude` session running over there." (gesture to the second terminal)

In the second terminal, run a command that names a brain page:
```
/qa https://localhost:3000  # or any command that reads a brain page
```

As the agent runs:
> "Watch the graph again." (a node pulses violet — the entity the agent just read)

> "The session pane parses Claude Code's session log. When the agent calls `get_page` or `query` on a brain entity, the graph node for that entity pulses live. Token spend on the left, agent attention on the right, synced."

## Beat 4 — 2:30–4:00 — Ship This

Back to the brief card stack. Click **Ship This** on one of the meeting cards.

(Two things happen simultaneously, both visible to the judge:)
1. The graph traces a path — the meeting page lights up, then its attendees, then anything linked from them. About 1.5 seconds.
2. macOS Terminal pops open. Repo path is set. Claude Code boots.

> "Couple things just happened. The graph traced the lineage — these are the pages the spawned agent will likely read once it starts. And Terminal opened in the repo I'm working in."

(Press cmd+V in the new Terminal.)

> "`/office-hours brain-page:<slug>` is on my clipboard already. One cmd+V and enter."

Press enter. New `/office-hours` session starts with the brain page as context.

> "That's the thesis. Memory on the left, action on the right, the bridge between them is a single click and a single paste."

## Beat 5 — 4:00–4:45 — The point

(Pause. Look at the judge.)

> "Most AI dev tools are either memory tools — Notion AI, Mem, whatever — or action tools — Cursor, Claude Code. The interesting work is in the bridge.
>
> This is built on Garry Tan's actual stack, gstack and gbrain. After this weekend I'm submitting it upstream as `gstack-hud`. Open source. MIT. The same way Garry ships everything else."

## Beat 6 — 4:45–5:00 — Hand off to Q&A

> "Happy to dig into the architecture, the cuts I made, or how you'd use this on your own stack. Q&A?"

## If something breaks live

- **Graph doesn't render.** Click the violet **Brief Me** button anyway; the cards still work. Say: "Graph is fed by `gbrain list-pages --sort link_count_desc` — if that flag isn't on this gbrain version it falls back to recursive query. I have a backup video at [URL] if it doesn't recover."
- **Brief Me returns empty.** Say: "I don't have a meeting on the calendar today. Pretend the cards are populated — here's what they look like from yesterday's session." (open a screenshot)
- **Ship This fails to open Terminal.** The clipboard still has the command. Say: "macOS Accessibility prompts the first time. Going to fall back to clipboard-only — paste into any Terminal." Open Terminal yourself, cmd+V, enter.
- **Session pane is empty.** Say: "Forgot to start a session — give me 5 seconds." Open a terminal on stage, run `claude`. The pane populates within 2 seconds. Recover the momentum with "And there it is."

## Things to NOT say during the demo

- "Mission control" — the framing was reset to "gstack↔gbrain remote" for a reason.
- "AI-native" filler — every demo says this. Replace with concrete verbs.
- "I built this in a weekend" until Q&A — it cheapens the technical credibility before the judge has formed an opinion.
- Em dashes when reading the script out loud. Pause instead.

## After the demo

- Push the public repo link in the closing slide.
- Mention the upstream-PR intent for `gstack-hud`.
- Thank Garry Tan publicly. Credit gstack + gbrain by name.
