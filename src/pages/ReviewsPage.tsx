import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { listPendingReviews } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { ReviewListItem } from '../types/contracts';

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
export function ReviewsPage() {
  const [items, setItems] = useState<ReviewListItem[]>(); const [error, setError] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => { listPendingReviews(getSupabaseClient()).then(setItems).catch(() => setError(true)); }, [reload]);
  return <><header className="page-header"><div><p className="eyebrow">Qualification</p><h1>Review queue</h1><p className="muted">Private evaluation data—visible only to active administrators.</p></div></header>
    {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !items ? <LoadingState /> : !items.length ? <EmptyState title="Queue clear" message="There are no applications waiting for review." /> :
    <section className="table-card"><div className="table-scroll"><table><thead><tr><th>Applicant</th><th>Platform</th><th>Submitted</th><th>Advisory score</th><th>Recommendation</th><th></th></tr></thead><tbody>{items.map((item) => <tr key={item.applicationId}>
      <td><strong className="mono short-id">{item.userId.slice(0, 8)}</strong></td><td><span className={`platform ${item.platform}`}>{item.platform}</span></td><td>{formatDate(item.submittedAt)}</td><td><strong>{Math.round(item.score)}</strong><span className="muted"> / 100</span></td><td><span className="status-pill">{item.recommendation.replaceAll('_', ' ')}</span></td><td><Link className="row-link" to={`/reviews/${item.applicationId}`}>Review →</Link></td>
    </tr>)}</tbody></table></div></section>}
  </>;
}
