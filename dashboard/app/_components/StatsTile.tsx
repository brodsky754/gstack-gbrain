import type { BrainStats } from '@/lib/types';

export function StatsTile({
  stats,
  className = '',
}: {
  stats: BrainStats;
  className?: string;
}) {
  return (
    <div className={`card text-sm w-72 ${className}`}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-text-muted">gbrain</span>
        <span className="font-mono text-xs text-text-dim">
          {stats.engine.toUpperCase()}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 font-mono">
        <dt className="text-text-muted">pages</dt>
        <dd className="text-right">{stats.page_count.toLocaleString()}</dd>
        <dt className="text-text-muted">chunks</dt>
        <dd className="text-right">{stats.chunk_count.toLocaleString()}</dd>
        <dt className="text-text-muted">people</dt>
        <dd className="text-right">{stats.people_count.toLocaleString()}</dd>
        <dt className="text-text-muted">companies</dt>
        <dd className="text-right">{stats.company_count.toLocaleString()}</dd>
        {stats.last_sync_iso && (
          <>
            <dt className="text-text-muted">last sync</dt>
            <dd className="text-right text-xs">
              {new Date(stats.last_sync_iso).toLocaleString()}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
