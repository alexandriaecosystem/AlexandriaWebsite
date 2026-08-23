import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { listPendingReviews } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { MessagingPlatform, ReviewListItem } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

function recommendationTone(value: string) {
  if (value === 'HIGHLY_RECOMMENDED' || value === 'RECOMMENDED') return 'positive';
  if (value === 'NOT_RECOMMENDED') return 'negative';
  return 'neutral';
}

export function ReviewsPage() {
  const { tr, isArabic } = useLanguage();
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

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tr('Unknown date', 'تاريخ غير معروف');
    return new Intl.DateTimeFormat(isArabic ? 'ar-LB' : undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const recommendationLabel = (value: string) => ({
    HIGHLY_RECOMMENDED: tr('Highly recommended', 'موصى به بشدة'),
    RECOMMENDED: tr('Recommended', 'موصى به'),
    MANUAL_REVIEW: tr('Manual review', 'مراجعة يدوية'),
    NOT_RECOMMENDED: tr('Not recommended', 'غير موصى به'),
  }[value] ?? value.replaceAll('_', ' '));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Qualification', 'التقييم')}</p>
          <h1>{tr('Review queue', 'قائمة المراجعة')}</h1>
          <p className="muted page-subtitle">{tr('Inspect advisory evaluation evidence and make the final human decision.', 'راجع أدلة التقييم الاستشاري واتخذ القرار النهائي يدوياً.')}</p>
        </div>
        {items && <span className="queue-count">{items.length} {tr('pending', 'معلّق')}</span>}
      </header>

      {error ? (
        <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />
      ) : !items ? (
        <LoadingState label={tr('Loading review queue', 'جارٍ تحميل قائمة المراجعة')} />
      ) : !items.length ? (
        <EmptyState title={tr('Queue clear', 'قائمة الانتظار فارغة')} message={tr('There are no applications waiting for review.', 'لا توجد طلبات بانتظار المراجعة.')} />
      ) : (
        <>
          <section className="toolbar" aria-label={tr('Review filters', 'مرشحات المراجعة')}>
            <label className="search-field">
              <span className="sr-only">{tr('Search applications', 'البحث في الطلبات')}</span>
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search user or application ID', 'ابحث بمعرّف المستخدم أو الطلب')} dir="ltr" />
            </label>
            <label className="select-field">
              <span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span>
              <select value={platform} onChange={(event) => setPlatform(event.target.value as 'all' | MessagingPlatform)}>
                <option value="all">{tr('All platforms', 'كل المنصات')}</option>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </label>
          </section>

          {!filteredItems.length ? (
            <EmptyState title={tr('No matching applications', 'لا توجد طلبات مطابقة')} message={tr('Try a different search term or platform filter.', 'جرّب عبارة بحث أو منصة مختلفة.')} />
          ) : (
            <section className="table-card">
              <div className="table-scroll">
                <table>
                  <thead><tr><th>{tr('Applicant', 'المتقدم')}</th><th>{tr('Platform', 'المنصة')}</th><th>{tr('Submitted', 'تاريخ التقديم')}</th><th>{tr('Advisory score', 'النتيجة الاستشارية')}</th><th>{tr('Recommendation', 'التوصية')}</th><th><span className="sr-only">{tr('Action', 'الإجراء')}</span></th></tr></thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.applicationId}>
                        <td><div className="identity-cell"><span className="avatar" aria-hidden="true">{item.userId.slice(0, 2).toUpperCase()}</span><span><strong className="mono short-id" dir="ltr">{item.userId.slice(0, 12)}</strong><small className="muted mono" dir="ltr">{item.applicationId.slice(0, 8)}</small></span></div></td>
                        <td><span className={`platform ${item.platform}`} dir="ltr">{item.platform}</span></td>
                        <td>{formatDate(item.submittedAt)}</td>
                        <td><div className="score-cell"><strong>{Math.round(item.score)}</strong><span className="muted">/100</span></div></td>
                        <td><span className={`status-pill ${recommendationTone(item.recommendation)}`}>{recommendationLabel(item.recommendation)}</span></td>
                        <td className="table-action"><Link className="row-link" to={`/reviews/${item.applicationId}`}>{tr('Review', 'مراجعة')} <span aria-hidden="true">→</span></Link></td>
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
