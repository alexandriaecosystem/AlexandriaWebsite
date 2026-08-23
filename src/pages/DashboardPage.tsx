import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getReviewCounts } from '../services/admin';
import type { ReviewCounts } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';

export function DashboardPage() {
  const [counts, setCounts] = useState<ReviewCounts>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    getReviewCounts(getSupabaseClient()).then(setCounts).catch(() => setError(true));
  }, [reload]);

  return (
    <>
      <header className="page-header hero-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Community overview</h1>
          <p className="muted page-subtitle">Review applicants, monitor delivery failures, and keep community access under human control.</p>
        </div>
        <div className="header-status-group">
          <span className="status-pill healthy"><span className="pill-dot" /> Admin verified</span>
        </div>
      </header>

      {error ? (
        <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />
      ) : !counts ? (
        <LoadingState label="Loading operational overview" />
      ) : (
        <>
          <section className="stats-grid" aria-label="Operational summary">
            <Link className="stat-card stat-card-primary" to="/reviews">
              <div className="stat-card-top"><span>Pending reviews</span><span className="stat-icon" aria-hidden="true">◎</span></div>
              <strong>{counts.pendingReviews}</strong>
              <small>{counts.pendingReviews === 1 ? '1 application needs a decision' : `${counts.pendingReviews} applications need decisions`}</small>
              <span className="card-link">Open queue <span aria-hidden="true">→</span></span>
            </Link>

            <Link className={`stat-card ${counts.failedOperations ? 'danger-card' : ''}`} to="/dead-letter">
              <div className="stat-card-top"><span>Dead-letter operations</span><span className="stat-icon" aria-hidden="true">!</span></div>
              <strong>{counts.failedOperations}</strong>
              <small>{counts.failedOperations ? 'Terminal failures need manual attention' : 'No terminal delivery failures'}</small>
              <span className="card-link">Inspect operations <span aria-hidden="true">→</span></span>
            </Link>

            <article className="stat-card">
              <div className="stat-card-top"><span>Access policy</span><span className="stat-icon" aria-hidden="true">✓</span></div>
              <strong className="stat-word">Human</strong>
              <small>AI evaluation remains advisory and cannot grant membership.</small>
              <span className="card-link muted">Manual approval enforced</span>
            </article>
          </section>

          <section className="dashboard-grid">
            <article className="panel safety-panel">
              <div className="panel-icon safe" aria-hidden="true">✓</div>
              <div>
                <p className="eyebrow">Safety invariant</p>
                <h2>Membership is never granted by an AI score</h2>
                <p className="muted">Evidence creates an advisory evaluation. Every applicant stays pending until an administrator explicitly approves or rejects the request.</p>
              </div>
            </article>

            <article className="panel quick-actions-panel">
              <div className="section-heading">
                <div><p className="eyebrow">Shortcuts</p><h2>Common actions</h2></div>
              </div>
              <div className="quick-actions">
                <Link to="/reviews"><span>Review applicants</span><small>Process the pending queue</small><b aria-hidden="true">→</b></Link>
                <Link to="/announcements"><span>Create announcement</span><small>Draft or approve a broadcast</small><b aria-hidden="true">→</b></Link>
                <Link to="/dead-letter"><span>Check failed operations</span><small>Retry terminal outbox events</small><b aria-hidden="true">→</b></Link>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}
