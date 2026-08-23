import { useEffect, useState } from 'react';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { listDeadLetterOperations, retryDeadLetterOperation } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { DeadLetterOperation } from '../types/contracts';

const formatDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export function DeadLetterPage() {
  const [items, setItems] = useState<DeadLetterOperation[]>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string>();

  useEffect(() => {
    setError(false);
    listDeadLetterOperations(getSupabaseClient()).then(setItems).catch(() => setError(true));
  }, [reload]);

  async function retry(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await retryDeadLetterOperation(getSupabaseClient(), id);
      setReload((count) => count + 1);
    } catch {
      setError(true);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Dead-letter operations</h1>
          <p className="muted page-subtitle">Outbox events that exhausted their retry attempts and now require an administrator to inspect or retry them.</p>
        </div>
        {items && <span className={items.length ? 'status-pill negative' : 'status-pill healthy'}>{items.length ? `${items.length} need attention` : 'Queue healthy'}</span>}
      </header>

      {error ? (
        <RetryableErrorState onRetry={() => { setError(false); setReload((count) => count + 1); }} />
      ) : !items ? (
        <LoadingState label="Loading failed operations" />
      ) : !items.length ? (
        <EmptyState title="No terminal failures" message="Every outbox event is either processed or still within its retry budget." />
      ) : (
        <section className="table-card">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Event</th><th>Aggregate</th><th>Attempts</th><th>Last error</th><th>Last updated</th><th><span className="sr-only">Action</span></th></tr></thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><strong>{item.eventType.replaceAll('_', ' ')}</strong></td>
                    <td><span className="mono short-id">{item.aggregateType}:{item.aggregateId.slice(0, 8)}</span></td>
                    <td><span className="attempt-badge">{item.attemptCount}</span></td>
                    <td><span className="error-cell">{item.lastError ?? 'No error recorded.'}</span></td>
                    <td>{formatDate(item.updatedAt)}</td>
                    <td className="table-action"><button type="button" className="compact-button" disabled={Boolean(busyId)} onClick={() => retry(item.id)}>{busyId === item.id ? 'Retrying…' : 'Retry'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
