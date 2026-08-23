import { useEffect, useState } from 'react';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { listDeadLetterOperations, retryDeadLetterOperation } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { DeadLetterOperation } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

export function DeadLetterPage() {
  const { tr, isArabic } = useLanguage();
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

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tr('Unknown date', 'تاريخ غير معروف');
    return new Intl.DateTimeFormat(isArabic ? 'ar-LB' : undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Operations', 'العمليات')}</p>
          <h1>{tr('Dead-letter operations', 'العمليات الفاشلة نهائياً')}</h1>
          <p className="muted page-subtitle">{tr('Outbox events that exhausted their retry attempts and now require an administrator to inspect or retry them.', 'أحداث الإرسال التي استنفدت محاولات إعادة التشغيل وتحتاج الآن إلى مراجعة أو إعادة محاولة من المسؤول.')}</p>
        </div>
        {items && <span className={items.length ? 'status-pill negative' : 'status-pill healthy'}>{items.length ? `${items.length} ${tr('need attention', 'تحتاج إلى متابعة')}` : tr('Queue healthy', 'القائمة سليمة')}</span>}
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((count) => count + 1); }} /> : !items ? (
        <LoadingState label={tr('Loading failed operations', 'جارٍ تحميل العمليات الفاشلة')} />
      ) : !items.length ? (
        <EmptyState title={tr('No terminal failures', 'لا توجد عمليات فاشلة نهائياً')} message={tr('Every outbox event is either processed or still within its retry budget.', 'كل أحداث الإرسال إما تمت معالجتها أو ما زالت ضمن عدد محاولات إعادة التشغيل المسموح.')} />
      ) : (
        <section className="table-card"><div className="table-scroll"><table>
          <thead><tr><th>{tr('Event', 'الحدث')}</th><th>{tr('Aggregate', 'المرجع')}</th><th>{tr('Attempts', 'المحاولات')}</th><th>{tr('Last error', 'آخر خطأ')}</th><th>{tr('Last updated', 'آخر تحديث')}</th><th><span className="sr-only">{tr('Action', 'الإجراء')}</span></th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td><strong dir="ltr">{item.eventType.replaceAll('_', ' ')}</strong></td>
            <td><span className="mono short-id" dir="ltr">{item.aggregateType}:{item.aggregateId.slice(0, 8)}</span></td>
            <td><span className="attempt-badge">{item.attemptCount}</span></td>
            <td><span className="error-cell" dir="ltr">{item.lastError ?? tr('No error recorded.', 'لم يتم تسجيل خطأ.')}</span></td>
            <td>{formatDate(item.updatedAt)}</td>
            <td className="table-action"><button type="button" className="compact-button" disabled={Boolean(busyId)} onClick={() => retry(item.id)}>{busyId === item.id ? tr('Retrying…', 'جارٍ إعادة المحاولة…') : tr('Retry', 'إعادة المحاولة')}</button></td>
          </tr>)}</tbody>
        </table></div></section>
      )}
    </>
  );
}
