import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getReviewCounts } from '../services/admin';
import type { ReviewCounts } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';

export function DashboardPage() {
  const [counts, setCounts] = useState<ReviewCounts>(); const [error, setError] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => { getReviewCounts(getSupabaseClient()).then(setCounts).catch(() => setError(true)); }, [reload]);
  return <><header className="page-header"><div><p className="eyebrow">Operations</p><h1>Community overview</h1><p className="muted">Human-controlled review and delivery health.</p></div><span className="status-pill healthy">Admin verified</span></header>
    {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !counts ? <LoadingState /> : <section className="stats-grid">
      <Link className="stat-card" to="/reviews"><span>Pending reviews</span><strong>{counts.pendingReviews}</strong><small>Require an explicit decision</small></Link>
      <Link className={`stat-card ${counts.failedOperations ? 'danger-card' : ''}`} to="/dead-letter"><span>Dead-letter operations</span><strong>{counts.failedOperations}</strong><small>{counts.failedOperations ? 'Backend attention required' : 'No terminal failures'}</small></Link>
      <article className="stat-card"><span>Authorization</span><strong>Human</strong><small>AI recommendations remain advisory</small></article>
    </section>}
    <section className="panel safety-panel"><div><p className="eyebrow">Safety invariant</p><h2>Membership is never granted by an AI score</h2></div><p>Evidence produces an advisory evaluation. Every applicant remains pending until an administrator explicitly approves them, and access becomes active only after the platform confirms admission.</p></section>
  </>;
}
