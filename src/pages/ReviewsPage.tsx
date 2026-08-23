import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { listPendingReviews } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { MessagingPlatform, ReviewListItem } from '../types/contracts';

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

function recommendationTone(value: string) {
  if (value === 'HIGHLY_RECOMMENDED' || value === 'RECOMMENDED') return 'positive';
  if (value === 'NOT_RECOMMENDED') return 'negative';
  return 'neutral';
}

export function ReviewsPage() {
  const [items, setItems] = useState<ReviewListItem[]>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<'all' | MessagingPlatform>('all');

  useEffect(() => {
    setError(false);
    listPendingReviews(getSupabaseClient()).then(setItems).catch(() => setError(true));
  }, [reload]);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesPlatform = platform === 'all' || item.platform === platform;
      const matchesQuery = !normalizedQuery || item.userId.toLowerCase().includes(normalizedQuery) || item.applicationId.toLowerCase().includes(normalizedQuery);
      return matchesPlatform && matchesQuery;
    });
  }, [items, platform, query]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Qualification</p>
          <h1>Review queue</h1>
          <p className="muted page-subtitle">Inspect advisory evaluation evidence and make the final human decision.</p>
        </div>
        {items && <span className="queue-count">{items.length} pending</span>}
      </header>

      {error ? (
        <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />
      ) : !items ? (
        <LoadingState label="Loading review queue" />
      ) : !items.length ? (
        <EmptyState title="Queue clear" message="There are no applications waiting for review." />
      ) : (
        <>
          <section className="toolbar" aria-label="Review filters">
            <label className="search-field">
              <span className="sr-only">Search applications</span>
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search user or application ID" />
            </label>
            <label className="select-field">
              <span className="sr-only">Filter by platform</span>
              <select value={platform} onChange={(event) => setPlatform(event.target.value as 'all' | MessagingPlatform)}>
                <option value="all">All platforms</option>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
          </section>

          {!filteredItems.length ? (
            <EmptyState title="No matching applications" message="Try a different search term or platform filter." />
          ) : (
            <section className="table-card">
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Applicant</th><th>Platform</th><th>Submitted</th><th>Advisory score</th><th>Recommendation</th><th><span className="sr-only">Action</span></th></tr></thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.applicationId}>
                        <td><div className="identity-cell"><span className="avatar" aria-hidden="true">{item.userId.slice(0, 2).toUpperCase()}</span><span><strong className="mono short-id">{item.userId.slice(0, 12)}</strong><small className="muted mono">{item.applicationId.slice(0, 8)}</small></span></div></td>
                        <td><span className={`platform ${item.platform}`}>{item.platform}</span></td>
                        <td>{formatDate(item.submittedAt)}</td>
                        <td><div className="score-cell"><strong>{Math.round(item.score)}</strong><span className="muted">/100</span></div></td>
                        <td><span className={`status-pill ${recommendationTone(item.recommendation)}`}>{item.recommendation.replaceAll('_', ' ')}</span></td>
                        <td className="table-action"><Link className="row-link" to={`/reviews/${item.applicationId}`}>Review <span aria-hidden="true">→</span></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
