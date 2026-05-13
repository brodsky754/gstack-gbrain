// Boots once per Next.js server process.
// Starts the session poller and runs the gbrain availability probe.
//
// Next.js calls this automatically when `experimental.instrumentationHook` is
// true (see next.config.js).

export async function register(): Promise<void> {
  // Only run on the Node.js server runtime, not Edge.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Lazy imports so client bundles don't pick up node: APIs.
  const { createSessionPoller } = await import('./lib/session-poller');
  const { probe } = await import('./lib/gbrain-client');
  const { bus } = await import('./lib/event-bus');

  // Probe gbrain. Surface clear banner if missing.
  const probeResult = await probe();
  if (!probeResult.ok) {
    // eslint-disable-next-line no-console
    console.warn(
      '\n[gstack-hud] gbrain not on PATH.\n' +
      '             Run ./bootstrap.sh in the repo root, or set GBRAIN_BIN.\n' +
      `             Probe error: ${probeResult.error}\n`,
    );
    bus.publish('gbrain_error', { error: probeResult.error ?? 'unknown' });
  } else {
    // eslint-disable-next-line no-console
    console.log(`[gstack-hud] gbrain detected: ${probeResult.version}`);
  }

  // Start the session poller. Reads ~/.claude/projects/*/sessions/*.jsonl
  // every 2s, emits bus events.
  const poller = createSessionPoller();
  poller.start();

  // Graceful shutdown.
  const stop = () => {
    poller.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  // eslint-disable-next-line no-console
  console.log('[gstack-hud] session poller started (2s interval).');
}
