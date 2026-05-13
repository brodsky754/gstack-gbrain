'use client';

import { useState } from 'react';
import type { BriefMeResult } from '@/lib/types';

export function BriefMePane() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BriefMeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runBrief() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/brief', { method: 'POST' });
      if (!res.ok) throw new Error(`brief failed: ${res.status}`);
      const data = (await res.json()) as BriefMeResult;
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function shipPage(slug: string) {
    try {
      const res = await fetch('/api/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      // TODO(hackathon): replace with a real toast component
      // eslint-disable-next-line no-alert
      alert(data.message ?? 'Ship This triggered');
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(`Ship This failed: ${(err as Error).message}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Brief Me</h2>
        <button
          type="button"
          onClick={runBrief}
          disabled={loading}
          className="btn-primary text-sm"
        >
          {loading ? 'briefing…' : 'Brief Me'}
        </button>
      </div>

      {error && (
        <div className="card border-status-errored/40 text-status-errored text-sm">
          {error}
        </div>
      )}

      {!result && !error && !loading && (
        <div className="text-text-muted text-sm">
          Click <em>Brief Me</em> for today's meetings, related people, and open threads.
        </div>
      )}

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-20 animate-pulse" />
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {[
            { label: "Today's meetings", pages: result.today_meetings },
            { label: 'Related people', pages: result.related_people },
            { label: 'Open threads', pages: result.open_threads },
          ].map((section) => (
            <details key={section.label} className="card" open>
              <summary className="cursor-pointer text-text-muted text-sm mb-2">
                {section.label} ({section.pages.length})
              </summary>
              <ul className="space-y-2 mt-2">
                {section.pages.length === 0 && (
                  <li className="text-text-dim text-sm">none</li>
                )}
                {section.pages.map((page) => (
                  <li
                    key={page.slug}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">{page.title}</div>
                      <div className="truncate font-mono text-xs text-text-dim">
                        {page.slug}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => shipPage(page.slug)}
                      className="btn-secondary text-xs px-3 min-h-0 py-1.5 shrink-0"
                    >
                      Ship this
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
