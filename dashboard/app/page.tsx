// Two-pane split (D6): cards on the left (~480px), graph on the right.
//
// Most logic lives in client components imported here so this server component
// stays a thin shell. The Server Component renders the initial graph snapshot
// fetched at request time; the client takes over for live updates over SSE.

import { getGraphSnapshot, getStats, probe } from '@/lib/gbrain-client';
import { BriefMePane } from './_components/BriefMePane';
import { SessionPane } from './_components/SessionPane';
import { GraphPane } from './_components/GraphPane';
import { StatsTile } from './_components/StatsTile';
import { ErrorBanner } from './_components/ErrorBanner';

export default async function Page() {
  // Probe gbrain at request time — render a banner if missing.
  const probeResult = await probe();
  const gbrainOk = probeResult.ok;

  // Fetch initial graph snapshot + stats in parallel, but tolerate failure.
  const [graph, stats] = gbrainOk
    ? await Promise.all([
        getGraphSnapshot(50).catch(() => null),
        getStats().catch(() => null),
      ])
    : [null, null];

  return (
    <main className="min-h-screen bg-bg text-text">
      {!gbrainOk && (
        <ErrorBanner
          title="gbrain not on PATH"
          message={`Run ./bootstrap.sh in the repo root, or set GBRAIN_BIN. Probe error: ${probeResult.error ?? 'unknown'}`}
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
          {stats && <StatsTile stats={stats} className="absolute top-6 right-6 z-10" />}
          <GraphPane initialSnapshot={graph} />
        </section>
      </div>
    </main>
  );
}
