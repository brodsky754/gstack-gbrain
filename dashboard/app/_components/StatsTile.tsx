import type { BrainStats } from '@/lib/types';

export function StatsTile({
  stats,
  className = '',
}: {
  stats: BrainStats;
  className?: string;
}) {
  // Derive entity counts from pages_by_type. The shape is dynamic
  // (any page type can land here), so we pick a few canonical ones to
  // display and total the rest under "other."
  const t = stats.pages_by_type ?? {};
  const peopleCount = t.person ?? 0;
  const companyCount = t.company ?? 0;
  const projectCount = t.project ?? 0;
  const conceptCount = t.concept ?? 0;
  const totalNamed = peopleCount + companyCount + projectCount + conceptCount;
  const otherCount = Math.max(0, stats.page_count - totalNamed);

  return (
    <div className={`card text-sm w-72 ${className}`}>
      <div className="flex items-baseline justify-between mb-3">
        <span className="text-text-muted">gbrain</span>
        <span className="font-mono text-xs text-text-dim">
          {stats.embedded_count > 0
            ? `${Math.round((stats.embedded_count / Math.max(1, stats.chunk_count)) * 100)}% embedded`
            : 'no embeddings'}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 font-mono">
        <dt className="text-text-muted">pages</dt>
        <dd className="text-right">{stats.page_count.toLocaleString()}</dd>
        <dt className="text-text-muted">chunks</dt>
        <dd className="text-right">{stats.chunk_count.toLocaleString()}</dd>
        <dt className="text-text-muted">links</dt>
        <dd className="text-right">{stats.link_count.toLocaleString()}</dd>
        <dt className="text-text-muted">tags</dt>
        <dd className="text-right">{stats.tag_count.toLocaleString()}</dd>
        <dt className="text-text-muted col-span-2 pt-2 border-t border-border mt-2">By type</dt>
        <dt className="text-text-muted">people</dt>
        <dd className="text-right">{peopleCount.toLocaleString()}</dd>
        <dt className="text-text-muted">companies</dt>
        <dd className="text-right">{companyCount.toLocaleString()}</dd>
        <dt className="text-text-muted">projects</dt>
        <dd className="text-right">{projectCount.toLocaleString()}</dd>
        <dt className="text-text-muted">concepts</dt>
        <dd className="text-right">{conceptCount.toLocaleString()}</dd>
        {otherCount > 0 && (
          <>
            <dt className="text-text-muted">other</dt>
            <dd className="text-right">{otherCount.toLocaleString()}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
