import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

// `next dev` / `next start` listen on every interface by default. The Host
// check in middleware.ts only stops browsers (DNS rebinding): a machine on the
// same network can connect directly, send `Host: localhost:3000`, and reach
// POST /api/ship (opens Terminal) and GET /api/events (streams the user's
// Claude session tool calls). The only thing that stops that is not listening
// on the network at all, so the scripts must bind to loopback.
const pkg = JSON.parse(readFileSync(join(import.meta.dir, '..', 'package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};

function boundHost(script: string): string | null {
  const m = /(?:^|\s)(?:-H|--hostname)(?:\s+|=)(\S+)/.exec(script);
  return m ? m[1] : null;
}

describe('dashboard server binds to loopback only', () => {
  for (const name of ['dev', 'start']) {
    test(`"${name}" script passes -H 127.0.0.1`, () => {
      const script = pkg.scripts[name];
      expect(script).toBeDefined();
      expect(boundHost(script)).toBe('127.0.0.1');
    });
  }
});
