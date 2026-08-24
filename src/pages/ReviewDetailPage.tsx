import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConflictState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { ConfirmDialog, useToast } from '../components/Feedback';
import { decideApplication, getApplicationAudit, getReviewDetail, listPendingReviews } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { ApplicationAuditDetail, ReviewDetail, ReviewListItem } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

function readableEvidence(item: unknown) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const value = item as Record<string, unknown>;
    return String(value.rationale ?? value.redacted_excerpt ?? value.summary ?? 'Evidence recorded');
  }
  return String(item);
}

function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function readableState(value: unknown) {
  return String(value ?? 'GENERAL').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

const clampScore = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));

export function ReviewDetailPage() {
  const { tr } = useLanguage();
  const { notify } = useToast();
  const { applicationId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ReviewDetail>();
  const [audit, setAudit] = useState<ApplicationAuditDetail>();
  const [queue, setQueue] = useState<ReviewListItem[]>([]);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [openNext, setOpenNext] = useState(true);
  const [pendingDecision, setPendingDecision] = useState<'APPROVE' | 'REJECT' | null>(null);

  useEffect(() => {
    setError(false);
    setReason('');
    Promise.all([
      getReviewDetail(getSupabaseClient(), applicationId),
      getApplicationAudit(getSupabaseClient(), applicationId),
      listPendingReviews(getSupabaseClient()),
    ]).then(([reviewDetail, applicationAudit, pending]) => {
      setDetail(reviewDetail);
      setAudit(applicationAudit);
      setQueue(pending);
    }).catch(() => setError(true));
  }, [applicationId, reload]);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    if (reason.trim().length < 8 || busy) return;
    setBusy(true);
    try {
      await decideApplication(getSupabaseClient(), applicationId, decision, reason.trim());
      notify({
        tone: 'success',
        title: decision === 'APPROVE' ? tr('Member approved', 'تم اعتماد العضو') : tr('Application rejected', 'تم رفض الطلب'),
        message: decision === 'APPROVE' ? tr('Community access has been queued.', 'تمت جدولة الوصول إلى المجتمع.') : tr('The decision was saved to the audit history.', 'تم حفظ القرار في سجل التدقيق.'),
      });
      if (openNext) {
        const refreshed = await listPendingReviews(getSupabaseClient());
        const next = refreshed.find((item) => item.applicationId !== applicationId);
        navigate(next ? `/reviews/${next.applicationId}` : '/reviews', { replace: true });
      } else {
        navigate('/reviews');
      }
    } catch (caught) {
      if (String(caught).includes('PENDING_REVIEW')) setConflict(true);
      else {
        notify({ tone: 'error', title: tr('Decision could not be saved', 'تعذر حفظ القرار'), message: caught instanceof Error ? caught.message : tr('Please try again.', 'يرجى المحاولة مرة أخرى.') });
        setError(true);
      }
    } finally {
      setBusy(false);
      setPendingDecision(null);
    }
  }

  if (conflict) return <ConflictState onReload={() => { setConflict(false); setReload((n) => n + 1); }} />;
  if (error) return <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />;
  if (!detail || !audit) return <LoadingState label={tr('Loading evaluation', 'جارٍ تحميل التقييم')} />;

  const score = clampScore(detail.score);
  const rationaleReady = reason.trim().length >= 8;
  const currentIndex = queue.findIndex((item) => item.applicationId === applicationId);
  const previousItem = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;
  const latestAccess = audit.access.length && audit.access[audit.access.length - 1] && typeof audit.access[audit.access.length - 1] === 'object'
    ? audit.access[audit.access.length - 1] as Record<string, unknown>
    : null;

  return (
    <>
      <Link className="back-link" to="/reviews">← {tr('Review queue', 'قائمة المراجعة')}</Link>

      {currentIndex >= 0 && queue.length > 1 && (
        <div className="review-nav" aria-label={tr('Review queue navigation', 'التنقل في قائمة المراجعة')}>
          <span className="review-progress">{tr(`Review ${currentIndex + 1} of ${queue.length}`, `المراجعة ${currentIndex + 1} من ${queue.length}`)}</span>
          <div className="review-nav-links">
            {previousItem ? <Link to={`/reviews/${previousItem.applicationId}`}>← {tr('Previous', 'السابق')}</Link> : <span />}
            {nextItem ? <Link to={`/reviews/${nextItem.applicationId}`}>{tr('Next', 'التالي')} →</Link> : <span />}
          </div>
        </div>
      )}

      <header className="page-header detail-header">
        <div>
          <p className="eyebrow">{tr('Pending review', 'قيد المراجعة')}</p>
          <h1>{tr('Application assessment', 'تقييم الطلب')}</h1>
          <div className="detail-meta"><span className={`platform ${detail.platform}`} dir="ltr">{detail.platform}</span></div>
        </div>
        <div className="score-ring" aria-label={tr(`Advisory score ${Math.round(score)} out of 100`, `النتيجة الاستشارية ${Math.round(score)} من 100`)}><strong>{Math.round(score)}</strong><span>{tr('/100 advisory', '/100 استشاري')}</span></div>
      </header>

      <div className="detail-grid">
        <section className="panel"><p className="panel-kicker">{tr('Evaluation', 'التقييم')}</p><h2>{tr('Summary', 'الملخص')}</h2><p>{detail.summary || tr('No evaluation summary was provided.', 'لم يتم توفير ملخص للتقييم.')}</p><div className="chip-row"><span className="status-pill neutral">{readableState(detail.recommendation)}</span></div></section>

        <section className="panel"><p className="panel-kicker">{tr('Signals', 'المؤشرات')}</p><h2>{tr('Category scores', 'درجات الفئات')}</h2>{Object.keys(detail.categoryScores).length ? <div className="score-list">{Object.entries(detail.categoryScores).map(([name, categoryScore]) => { const normalized = clampScore(categoryScore); return <div key={name}><span dir="ltr">{name.replaceAll('_', ' ')}</span><meter min="0" max="100" value={normalized} /><strong>{Math.round(normalized)}</strong></div>; })}</div> : <p className="muted">{tr('No category scores available.', 'لا توجد درجات للفئات.')}</p>}</section>

        <section className="panel signal-panel positive-panel"><p className="panel-kicker">{tr('Evidence', 'الأدلة')}</p><h2>{tr('Strengths', 'نقاط القوة')}</h2>{detail.strengths.length ? <ul className="signal-list">{detail.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No strengths recorded.', 'لم يتم تسجيل نقاط قوة.')}</p>}</section>

        <section className="panel signal-panel concern-panel"><p className="panel-kicker">{tr('Evidence', 'الأدلة')}</p><h2>{tr('Concerns', 'الملاحظات')}</h2>{detail.concerns.length ? <ul className="signal-list">{detail.concerns.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No concerns recorded.', 'لم يتم تسجيل ملاحظات.')}</p>}</section>

        <section className="panel span-two"><p className="panel-kicker">{tr('Traceability', 'التتبّع')}</p><h2>{tr('Supporting evidence', 'الأدلة الداعمة')}</h2>{detail.evidence.length ? <ol className="evidence-list">{detail.evidence.map((item, index) => <li key={index}>{readableEvidence(item)}</li>)}</ol> : <p className="muted">{tr('No evidence excerpts were attached to this evaluation.', 'لم يتم إرفاق مقتطفات أدلة بهذا التقييم.')}</p>}</section>

        <section className="panel span-two">
          <p className="panel-kicker">{tr('Community access', 'الوصول إلى المجتمع')}</p>
          <h2>{tr('Current access status', 'حالة الوصول الحالية')}</h2>
          {latestAccess ? (
            <dl className="profile-list access-detail-list">
              <div><dt>{tr('State', 'الحالة')}</dt><dd><span className="status-pill neutral">{readableState(latestAccess.state ?? latestAccess.new_state)}</span></dd></div>
              <div><dt>{tr('Invite sent', 'تم إرسال الدعوة')}</dt><dd>{formatDate(latestAccess.invite_sent_at)}</dd></div>
              <div><dt>{tr('Activated', 'تم التفعيل')}</dt><dd>{formatDate(latestAccess.activated_at)}</dd></div>
              <div><dt>{tr('Last error', 'آخر خطأ')}</dt><dd>{latestAccess.last_error ? String(latestAccess.last_error) : '—'}</dd></div>
            </dl>
          ) : <p className="muted">{tr('No access request exists yet. Approval will queue the community access process.', 'لا يوجد طلب وصول حتى الآن. الاعتماد سيضع عملية الوصول إلى المجتمع في قائمة التنفيذ.')}</p>}
        </section>
      </div>

      <section className="decision-panel">
        <div><p className="eyebrow">{tr('Human decision required', 'مطلوب قرار من المسؤول')}</p><h2>{tr('Approve or reject this application', 'اعتماد أو رفض هذا الطلب')}</h2><p className="muted">{tr('The rationale is stored with the administrator decision and audit history. AI scoring remains advisory.', 'يتم حفظ سبب القرار مع سجل المسؤول والتدقيق. تبقى نتيجة الذكاء الاصطناعي استشارية فقط.')}</p><div className="decision-warning">{tr('This action changes the application state. Review the evidence before continuing.', 'هذا الإجراء يغيّر حالة الطلب. راجع الأدلة قبل المتابعة.')}</div></div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>{tr('Decision rationale', 'سبب القرار')}<textarea minLength={8} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Record a clear reason for this decision…', 'اكتب سبباً واضحاً لهذا القرار…')} /><small className={rationaleReady ? 'helper success-text' : 'helper'}>{rationaleReady ? tr('Rationale ready', 'السبب جاهز') : tr('Enter at least 8 characters', 'أدخل 8 أحرف على الأقل')}</small></label>
          <label className="review-next-toggle"><input type="checkbox" checked={openNext} onChange={(event) => setOpenNext(event.target.checked)} /> {tr('After saving, open the next pending review', 'بعد الحفظ، افتح المراجعة المعلقة التالية')}</label>
          <div className="decision-actions"><button type="button" className="danger" disabled={busy || !rationaleReady} onClick={() => setPendingDecision('REJECT')}>{tr('Reject', 'رفض')}</button><button type="button" className="primary" disabled={busy || !rationaleReady} onClick={() => setPendingDecision('APPROVE')}>{busy ? tr('Saving…', 'جارٍ الحفظ…') : tr('Approve & queue access', 'اعتماد وإرسال طلب الوصول')}</button></div>
        </form>
      </section>

      <ConfirmDialog
        open={Boolean(pendingDecision)}
        title={pendingDecision === 'APPROVE' ? tr('Approve this member?', 'اعتماد هذا العضو؟') : tr('Reject this application?', 'رفض هذا الطلب؟')}
        message={<p><strong>{tr('Decision rationale', 'سبب القرار')}:</strong> {reason.trim()}</p>}
        confirmLabel={busy ? tr('Saving…', 'جارٍ الحفظ…') : pendingDecision === 'APPROVE' ? tr('Approve member', 'اعتماد العضو') : tr('Reject application', 'رفض الطلب')}
        cancelLabel={tr('Back to review', 'العودة للمراجعة')}
        tone={pendingDecision === 'REJECT' ? 'danger' : 'primary'}
        busy={busy}
        onCancel={() => setPendingDecision(null)}
        onConfirm={() => { if (pendingDecision) void decide(pendingDecision); }}
      />
    </>
  );
}
