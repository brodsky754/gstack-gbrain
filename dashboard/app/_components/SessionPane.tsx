'use client';

import { useEffect, useState } from 'react';
import type { SessionActivePayload, BusEvent } from '@/lib/types';

interface SessionRow extends SessionActivePayload {
  status: 'active' | 'idle' | 'errored';
  last_tool: string | null;
  last_seen_ms: number;
}

const IDLE_THRESHOLD_MS = 10_000;

export function SessionPane() {
  const [sessions, setSessions] = useState<Record<string, SessionRow>>({});

  useEffect(() => {
    const source = new EventSource('/api/events');

    function onSessionActive(e: MessageEvent) {
      const payload = JSON.parse(e.data) as SessionActivePayload;
      setSessions((prev) => ({
        ...prev,
        [payload.session_id]: {
          ...payload,
          status: 'active',
          last_tool: prev[payload.session_id]?.last_tool ?? null,
          last_seen_ms: Date.now(),
        },
      }));
    }

    function onToolCall(e: MessageEvent) {
      const payload = JSON.parse(e.data) as { session_id: string; tool_name: string };
      setSessions((prev) => {
        const row = prev[payload.session_id];
        if (!row) return prev;
        return {
          ...prev,
          [payload.session_id]: { ...row, last_tool: payload.tool_name },
        };
      });
    }

    source.addEventListener('session_active', onSessionActive);
    source.addEventListener('tool_call', onToolCall);

    // Demote stale sessions to idle every second.
    const tick = setInterval(() => {
      setSessions((prev) => {
        const now = Date.now();
        let changed = false;
        const next = { ...prev };
        for (const id of Object.keys(next)) {
          const row = next[id];
          if (now - row.last_seen_ms > IDLE_THRESHOLD_MS && row.status !== 'idle') {
            next[id] = { ...row, status: 'idle' };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1_000);

    return () => {
      source.close();
      clearInterval(tick);
    };
  }, []);

  const rows = Object.values(sessions).sort(
    (a, b) => b.last_seen_ms - a.last_seen_ms,
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">GSTACK sessions</h2>
      {rows.length === 0 && (
        <div className="text-text-muted text-sm">
          No active sessions. Start a <code className="font-mono text-xs">claude</code> session in any repo.
        </div>
      )}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.session_id} className="card text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center">
                <span className={`status-dot bg-status-${row.status}`} />
                <span className="font-mono text-xs truncate max-w-[200px]">
                  {row.project_slug}
                </span>
              </span>
              <span className="font-mono text-xs text-text-dim">
                {row.token_spend.input + row.token_spend.output} tok
              </span>
            </div>
            <div className="text-text-muted text-xs">
              {row.active_skill ?? 'no skill'} · {row.last_tool ?? '—'}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
