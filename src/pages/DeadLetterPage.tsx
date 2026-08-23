import { useEffect, useState } from 'react';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { listDeadLetterOperations, retryDeadLetterOperation } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { DeadLetterOperation } from '../types/contracts';

const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

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
    setBusyId(id);
    try {
      await retryDeadLetterOperation(getSupabaseClient(), id);
      setReload((n) => n + 1);
    } catch {
      setError(true);
    } finally {
      setBusyId(undefined);
    }
  }

  return <>
    <header className="page-header">
      <div>
        <p className="eyebrow">Operations</p>
        <h1>Dead-letter operations</h1>
        <p className="muted">Outbox events that exhausted their retry attempts and require manual attention.</p>
      </div>
    </header>
    {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> :
      !items ? <LoadingState /> :
      !items.length ? <EmptyState title="No terminal failures" message="Every outbox event is either processed or still within its retry budget." /> :
      <section className="table-card"><div className="table-scroll"><table>
        <thead><tr><th>Event</th><th>Aggregate</th><th>Attempts</th><th>Last error</th><th>Last updated</th><th></th></tr></thead>
        <tbody>{items.map((item) => <tr key={item.id}>
          <td><strong>{item.eventType.replaceAll('_', ' ')}</strong></td>
          <td><span className="mono short-id">{item.aggregateType}:{item.aggregateId.slice(0, 8)}</span></td>
          <td>{item.attemptCount}</td>
          <td>{item.lastError ?? <span className="muted">No error recorded.</span>}</td>
          <td>{formatDate(item.updatedAt)}</td>
          <td><button className="row-link" disabled={busyId === item.id} onClick={() => retry(item.id)}>{busyId === item.id ? 'Retrying…' : 'Retry →'}</button></td>
        </tr>)}</tbody>
      </table></div></section>}
  </>;
}
