import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, RetryableErrorState, TableSkeleton } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import { listAdmissions, type AdmissionListItem, type AdmissionStage } from '../services/admission';
import { approveVipRecommendation, dismissVipRecommendation, listVipRecommendations, type VipRecommendation } from '../services/vip-recommendations';
import { getSupabaseClient } from '../services/supabase';

type ReviewSort = 'newest' | 'oldest' | 'score-high' | 'score-low';

function stageTone(stage: AdmissionStage) {
  if (stage === 'APPROVED') return 'positive';
  if (stage === 'NOT_READY') return 'negative';
  return 'neutral';
}

export function ReviewsPage() {
  const { tr, isArabic } = useLanguage();
  const [items, setItems] = useState<AdmissionListItem[]>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const [stage, setStage] = useState('all');
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [recommendations, setRecommendations] = useState<VipRecommendation[]>([]);
  const [recommendationBusy, setRecommendationBusy] = useState('');
  const [recommendationNote, setRecommendationNote] = useState('');

  useEffect(() => {
    setError(false);
    listAdmissions(getSupabaseClient()).then(setItems).catch(() => setError(true));
    listVipRecommendations(getSupabaseClient()).then(setRecommendations).catch(() => setRecommendations([]));
  }, [reload]);

  async function decideRecommendation(userId: string, decision: 'approve' | 'dismiss') {
    setRecommendationBusy(userId);
    setRecommendationNote('');
    try {
      if (decision === 'approve') {
        const result = await approveVipRecommendation(getSupabaseClient(), userId);
        setRecommendationNote(tr(
          `Approved — the private invite is being sent on ${result.platform}.`,
          `تمت الموافقة — يتم إرسال الدعوة الخاصة عبر ${result.platform}.`,
        ));
      } else {
        await dismissVipRecommendation(getSupabaseClient(), userId);
        setRecommendationNote(tr('Recommendation dismissed.', 'تم تجاهل الترشيح.'));
      }
      setReload((n) => n + 1);
    } catch (caught) {
      setRecommendationNote(caught instanceof Error ? caught.message : tr('The action failed.', 'فشل الإجراء.'));
    } finally {
      setRecommendationBusy('');
    }
  }

  const stageLabel = (value: AdmissionStage) => ({
    SCORE_REVIEW: tr('Assessment review', 'مراجعة التقييم'),
    FORM_PENDING: tr('Awaiting information', 'بانتظار المعلومات'),
    INFORMATION_REVIEW: tr('Information review', 'مراجعة المعلومات'),
    CORRECTIONS_REQUIRED: tr('Awaiting corrected information', 'بانتظار المعلومات المصححة'),
    APPROVED: tr('Final approval', 'الموافقة النهائية'),
    NOT_READY: tr('Deferred / declined', 'مؤجل / مرفوض'),
  }[value] ?? value.replaceAll('_', ' '));

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return items
      .filter((item) => {
        const matchesPlatform = platform === 'all' || item.platform === platform;
        const matchesStage = stage === 'all' || item.stage === stage;
        const matchesQuery = !normalizedQuery
          || item.name.toLowerCase().includes(normalizedQuery)
          || item.applicationId.toLowerCase().includes(normalizedQuery);
        return matchesPlatform && matchesStage && matchesQuery;
      })
      .sort((a, b) => {
        if (sort === 'score-high') return (b.totalScore ?? -1) - (a.totalScore ?? -1);
        if (sort === 'score-low') return (a.totalScore ?? 101) - (b.totalScore ?? 101);
        const aTime = new Date(a.updatedAt).getTime();
        const bTime = new Date(b.updatedAt).getTime();
        return sort === 'oldest' ? aTime - bTime : bTime - aTime;
      });
  }, [items, platform, query, sort, stage]);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return tr('Unknown date', 'تاريخ غير معروف');
    return new Intl.DateTimeFormat(isArabic ? 'ar-LB' : undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const score = (value: number | null) => value == null ? '—' : `${Math.round(value)}/100`;
  const actionableCount = items?.filter((item) => ['SCORE_REVIEW', 'INFORMATION_REVIEW'].includes(item.stage)).length ?? 0;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('VIP admission', 'قبول VIP')}</p>
          <h1>{tr('Admission reviews', 'مراجعات القبول')}</h1>
          <p className="muted page-subtitle">{tr('Review backend assessment evidence first, then separately verify submitted information before private access is approved.', 'راجع أدلة التقييم من الخلفية أولاً، ثم تحقق بشكل منفصل من المعلومات المقدمة قبل الموافقة على الوصول الخاص.')}</p>
        </div>
        {items && <span className="queue-count">{actionableCount} {tr('need a decision', 'تحتاج إلى قرار')}</span>}
      </header>

      {recommendations.length > 0 && (
        <section className="panel" aria-label={tr('VIP recommendations', 'ترشيحات VIP')}>
          <p className="eyebrow">{tr('Agent recommendations', 'ترشيحات الوكيل')}</p>
          <h2>{tr('Recommended for the VIP community', 'مرشحون لمجتمع VIP')}</h2>
          <p className="muted">{tr('These members answered enough daily questions well. Approving sends them the private invite by DM — nothing is posted in the group.', 'هؤلاء الأعضاء أجابوا جيداً على عدد كافٍ من الأسئلة اليومية. الموافقة ترسل لهم الدعوة الخاصة برسالة مباشرة — لا يُنشر شيء في المجموعة.')}</p>
          {recommendationNote && <p className="muted" role="status">{recommendationNote}</p>}
          <div className="account-list">
            {recommendations.map((rec) => (
              <div className="account-card" key={rec.userId}>
                <strong>{rec.name || tr('Unnamed member', 'عضو بدون اسم')}</strong>
                <small className="muted">
                  {tr('Score', 'النتيجة')} {rec.qualificationScore == null ? '—' : Math.round(rec.qualificationScore)}/100
                  {' · '}{rec.answerCount} {tr('answers', 'إجابة')}
                  {' · '}{rec.platforms.join(', ') || '—'}
                </small>
                <div className="chip-row">
                  <button type="button" className="primary-button" disabled={recommendationBusy === rec.userId}
                    onClick={() => void decideRecommendation(rec.userId, 'approve')}>
                    {recommendationBusy === rec.userId ? tr('Working…', 'جارٍ التنفيذ…') : tr('Approve & invite', 'موافقة وإرسال دعوة')}
                  </button>
                  <button type="button" className="ghost-button" disabled={recommendationBusy === rec.userId}
                    onClick={() => void decideRecommendation(rec.userId, 'dismiss')}>
                    {tr('Dismiss', 'تجاهل')}
                  </button>
                  <Link className="row-link" to={`/users/${rec.userId}`}>{tr('View member', 'عرض العضو')}</Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {error ? (
        <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />
      ) : !items ? (
        <TableSkeleton columns={8} rows={6} />
      ) : !items.length ? (
        <EmptyState title={tr('No admission records', 'لا توجد سجلات قبول')} message={tr('No participants have reached the admission review system yet.', 'لم يصل أي مشارك إلى نظام مراجعة القبول بعد.')} />
      ) : (
        <>
          <section className="toolbar" aria-label={tr('Admission review filters', 'مرشحات مراجعة القبول')}>
            <label className="search-field">
              <span className="sr-only">{tr('Search admissions', 'البحث في القبول')}</span>
              <span className="search-icon" aria-hidden="true">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr('Search participant or application ID', 'ابحث باسم المشارك أو معرّف الطلب')} />
            </label>
            <div className="table-tools">
              <label className="select-field">
                <span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span>
                <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                  <option value="all">{tr('All platforms', 'كل المنصات')}</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="discord">Discord</option>
                </select>
              </label>
              <label className="select-field">
                <span className="sr-only">{tr('Filter by stage', 'تصفية حسب المرحلة')}</span>
                <select value={stage} onChange={(event) => setStage(event.target.value)}>
                  <option value="all">{tr('All stages', 'كل المراحل')}</option>
                  <option value="SCORE_REVIEW">{stageLabel('SCORE_REVIEW')}</option>
                  <option value="FORM_PENDING">{stageLabel('FORM_PENDING')}</option>
                  <option value="INFORMATION_REVIEW">{stageLabel('INFORMATION_REVIEW')}</option>
                  <option value="CORRECTIONS_REQUIRED">{stageLabel('CORRECTIONS_REQUIRED')}</option>
                  <option value="APPROVED">{stageLabel('APPROVED')}</option>
                  <option value="NOT_READY">{stageLabel('NOT_READY')}</option>
                </select>
              </label>
              <label className="select-field">
                <span className="sr-only">{tr('Sort admission reviews', 'ترتيب مراجعات القبول')}</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as ReviewSort)}>
                  <option value="newest">{tr('Newest first', 'الأحدث أولاً')}</option>
                  <option value="oldest">{tr('Oldest first', 'الأقدم أولاً')}</option>
                  <option value="score-high">{tr('Highest combined score', 'أعلى نتيجة مجمعة')}</option>
                  <option value="score-low">{tr('Lowest combined score', 'أقل نتيجة مجمعة')}</option>
                </select>
              </label>
            </div>
          </section>

          {!filteredItems.length ? (
            <EmptyState title={tr('No matching admissions', 'لا توجد طلبات مطابقة')} message={tr('Try different filters or a different search term.', 'جرّب مرشحات أو عبارة بحث مختلفة.')} />
          ) : (
            <section className="table-card mobile-card-table">
              <div className="table-scroll">
                <table className="responsive-table">
                  <thead><tr>
                    <th>{tr('Applicant', 'المتقدم')}</th>
                    <th>{tr('Platform', 'المنصة')}</th>
                    <th>{tr('Stage', 'المرحلة')}</th>
                    <th>{tr('Quiz', 'الاختبار')}</th>
                    <th>{tr('Crypto understanding', 'فهم العملات الرقمية')}</th>
                    <th>{tr('Combined', 'المجمعة')}</th>
                    <th>{tr('Updated', 'آخر تحديث')}</th>
                    <th><span className="sr-only">{tr('Action', 'الإجراء')}</span></th>
                  </tr></thead>
                  <tbody>
                    {filteredItems.map((item) => (
                      <tr key={item.applicationId}>
                        <td data-label={tr('Applicant', 'المتقدم')}><div className="identity-cell"><span className="avatar" aria-hidden="true">{item.name.slice(0, 2).toUpperCase()}</span><span><strong>{item.name}</strong><small className="muted mono" dir="ltr">{item.applicationId.slice(0, 8)}</small></span></div></td>
                        <td data-label={tr('Platform', 'المنصة')}><span className={`platform ${item.platform}`} dir="ltr">{item.platform}</span></td>
                        <td data-label={tr('Stage', 'المرحلة')}><span className={`status-pill ${stageTone(item.stage)}`}>{stageLabel(item.stage)}</span></td>
                        <td data-label={tr('Quiz', 'الاختبار')}>{score(item.quizScore)}</td>
                        <td data-label={tr('Crypto understanding', 'فهم العملات الرقمية')}>{score(item.personaScore)}</td>
                        <td data-label={tr('Combined', 'المجمعة')}><strong>{score(item.totalScore)}</strong></td>
                        <td data-label={tr('Updated', 'آخر تحديث')}>{formatDate(item.updatedAt)}</td>
                        <td data-label="" className="table-action"><Link className="row-link" to={`/reviews/${item.applicationId}`}>{tr('Open', 'فتح')} <span aria-hidden="true">→</span></Link></td>
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
