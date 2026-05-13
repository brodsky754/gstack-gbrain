// Two-pane split (D6): cards on the left (~480px), graph on the right.
//
// Most logic lives in client components imported here so this server component
// stays a thin shell. The Server Component renders the initial graph snapshot
// fetched at request time; the client takes over for live updates over SSE.

import { getBrainState, getGraphSnapshot } from '@/lib/gbrain-client';
import { BriefMePane } from './_components/BriefMePane';
import { SessionPane } from './_components/SessionPane';
import { GraphPane } from './_components/GraphPane';
import { StatsTile } from './_components/StatsTile';
import { ErrorBanner } from './_components/ErrorBanner';

export default async function Page() {
  // Single-call brain-state detection drives every empty-state below.
  const brain = await getBrainState();

  // Only fetch the graph snapshot when the brain actually has data. Saves
  // four wasted `gbrain list` subprocesses against an uninitialized brain.
  const graph =
    brain.state === 'has_data'
      ? await getGraphSnapshot(50).catch(() => null)
      : null;

  return (
    <main className="min-h-screen bg-bg text-text">
      {brain.state === 'absent' && (
        <ErrorBanner
          title="gbrain not on PATH"
          message={`Run ./bootstrap.sh in the repo root, or set GBRAIN_BIN. ${brain.reason ?? ''}`}
        />
      )}

      <div className="grid grid-cols-[480px_1fr] h-screen">
        {/* Left pane: Brief Me + GSTACK session pane */}
        <section className="border-r border-border overflow-y-auto p-6 space-y-6">
          <header className="flex items-baseline justify-between">
            <h1 className="text-2xl font-semibold tracking-tight">
              gstack↔gbrain remote
            </h1>
            <span className="text-sm text-text-muted font-mono">v0.1</span>
          </header>
          <BriefMePane />
          <SessionPane />
        </section>

        {/* Right pane: graph + slim GBRAIN stats tile */}
        <section className="relative overflow-hidden">
          {brain.stats && (
            <StatsTile stats={brain.stats} className="absolute top-6 right-6 z-10" />
          )}
          <GraphPane initialSnapshot={graph} brainState={brain.state} />
        </section>
      </div>
    </main>
  );
}
