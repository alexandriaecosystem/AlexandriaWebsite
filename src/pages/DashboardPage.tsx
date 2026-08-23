import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics } from '../services/admin';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    getDashboardMetrics(getSupabaseClient()).then(setMetrics).catch(() => setError(true));
  }, [reload]);

  return (
    <>
      <header className="page-header hero-header">
        <div>
          <p className="eyebrow">Operations & analytics</p>
          <h1>Community overview</h1>
          <p className="muted page-subtitle">Live membership, messaging, AI usage, review, and delivery health from Supabase.</p>
        </div>
        <span className="status-pill healthy"><span className="pill-dot" /> Admin verified</span>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !metrics ? (
        <LoadingState label="Loading community metrics" />
      ) : (
        <>
          <section className="metric-grid" aria-label="Community metrics">
            <article className="metric-card"><span>Total users</span><strong>{metrics.totalUsers.toLocaleString()}</strong><small>{metrics.activeUsers.toLocaleString()} active · {metrics.approvedUsers.toLocaleString()} approved</small></article>
            <article className="metric-card"><span>Total messages</span><strong>{metrics.totalMessages.toLocaleString()}</strong><small>{metrics.messagesToday.toLocaleString()} today · {metrics.messagesLast7Days.toLocaleString()} last 7 days</small></article>
            <Link className="metric-card metric-link" to="/analytics"><span>AI cost</span><strong>{money(metrics.aiCostTotal)}</strong><small>{money(metrics.aiCostToday)} today · {money(metrics.aiCost30Days)} last 30 days</small></Link>
            <Link className="metric-card metric-link" to="/reviews"><span>Pending reviews</span><strong>{metrics.pendingReviews.toLocaleString()}</strong><small>{metrics.pendingReviews ? 'Human decisions required' : 'Queue is clear'}</small></Link>
            <article className="metric-card"><span>AI responses</span><strong>{metrics.aiResponses.toLocaleString()}</strong><small>{metrics.cachedResponses.toLocaleString()} cached · {percent(metrics.cacheHitRate)} cache rate</small></article>
            <Link className={`metric-card metric-link ${metrics.failedOperations ? 'metric-danger' : ''}`} to="/dead-letter"><span>Failed operations</span><strong>{metrics.failedOperations.toLocaleString()}</strong><small>{metrics.failedOperations ? 'Needs manual attention' : 'No dead-letter work'}</small></Link>
          </section>

          <section className="dashboard-grid">
            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">30-day activity</p><h2>Messaging footprint</h2></div></div>
              <div className="mini-stat-row"><span>Messages, 30 days</span><strong>{metrics.messagesLast30Days.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>Input tokens</span><strong>{metrics.inputTokens.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>Output tokens</span><strong>{metrics.outputTokens.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>Blocked users</span><strong>{metrics.blockedUsers.toLocaleString()}</strong></div>
              <Link className="inline-link" to="/analytics">Open AI usage analytics →</Link>
            </article>

            <article className="panel quick-actions-panel">
              <div className="section-heading"><div><p className="eyebrow">Shortcuts</p><h2>Common actions</h2></div></div>
              <div className="quick-actions">
                <Link to="/reviews"><span>Review applicants</span><small>Process the pending queue</small><b aria-hidden="true">→</b></Link>
                <Link to="/knowledge"><span>Manage knowledge base</span><small>Upload and approve project sources</small><b aria-hidden="true">→</b></Link>
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
