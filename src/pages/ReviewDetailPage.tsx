import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConflictState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { decideApplication, getApplicationAudit, getReviewDetail } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { ApplicationAuditDetail, ReviewDetail } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

function readableEvidence(item: unknown) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const value = item as Record<string, unknown>;
    return String(value.rationale ?? value.redacted_excerpt ?? JSON.stringify(item));
  }
  return String(item);
}

const clampScore = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));

export function ReviewDetailPage() {
  const { tr } = useLanguage();
  const { applicationId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ReviewDetail>();
  const [audit, setAudit] = useState<ApplicationAuditDetail>();
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    Promise.all([
      getReviewDetail(getSupabaseClient(), applicationId),
      getApplicationAudit(getSupabaseClient(), applicationId),
    ])
      .then(([reviewDetail, applicationAudit]) => {
        setDetail(reviewDetail);
        setAudit(applicationAudit);
      })
      .catch(() => setError(true));
  }, [applicationId, reload]);

  async function decide(decision: 'APPROVE' | 'REJECT') {
    if (reason.trim().length < 8 || busy) return;
    setBusy(true);
    try {
      await decideApplication(getSupabaseClient(), applicationId, decision, reason.trim());
      navigate('/reviews');
    } catch (caught) {
      if (String(caught).includes('PENDING_REVIEW')) setConflict(true);
      else setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (conflict) return <ConflictState onReload={() => { setConflict(false); setReload((n) => n + 1); }} />;
  if (error) return <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />;
  if (!detail || !audit) return <LoadingState label={tr('Loading evaluation', 'جارٍ تحميل التقييم')} />;

  const score = clampScore(detail.score);
  const rationaleReady = reason.trim().length >= 8;

  return (
    <>
      <Link className="back-link" to="/reviews">← {tr('Review queue', 'قائمة المراجعة')}</Link>
      <header className="page-header detail-header">
        <div>
          <p className="eyebrow">{tr('Pending review', 'قيد المراجعة')}</p>
          <h1>{tr('Application assessment', 'تقييم الطلب')}</h1>
          <div className="detail-meta">
            <span className={`platform ${detail.platform}`} dir="ltr">{detail.platform}</span>
            <span className="mono muted" dir="ltr">{detail.applicationId}</span>
          </div>
        </div>
        <div className="score-ring" aria-label={tr(`Advisory score ${Math.round(score)} out of 100`, `النتيجة الاستشارية ${Math.round(score)} من 100`)}>
          <strong>{Math.round(score)}</strong>
          <span>{tr('/100 advisory', '/100 استشاري')}</span>
        </div>
      </header>

      <div className="detail-grid">
        <section className="panel">
          <p className="panel-kicker">{tr('Evaluation', 'التقييم')}</p>
          <h2>{tr('Summary', 'الملخص')}</h2>
          <p>{detail.summary || tr('No evaluation summary was provided.', 'لم يتم توفير ملخص للتقييم.')}</p>
          <div className="chip-row"><span className="status-pill neutral">{detail.recommendation.replaceAll('_', ' ')}</span></div>
        </section>

        <section className="panel">
          <p className="panel-kicker">{tr('Signals', 'المؤشرات')}</p>
          <h2>{tr('Category scores', 'درجات الفئات')}</h2>
          {Object.keys(detail.categoryScores).length ? (
            <div className="score-list">
              {Object.entries(detail.categoryScores).map(([name, categoryScore]) => {
                const normalized = clampScore(categoryScore);
                return <div key={name}><span dir="ltr">{name.replaceAll('_', ' ')}</span><meter min="0" max="100" value={normalized} /><strong>{Math.round(normalized)}</strong></div>;
              })}
            </div>
          ) : <p className="muted">{tr('No category scores available.', 'لا توجد درجات للفئات.')}</p>}
        </section>

        <section className="panel signal-panel positive-panel">
          <p className="panel-kicker">{tr('Evidence', 'الأدلة')}</p>
          <h2>{tr('Strengths', 'نقاط القوة')}</h2>
          {detail.strengths.length ? <ul className="signal-list">{detail.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No strengths recorded.', 'لم يتم تسجيل نقاط قوة.')}</p>}
        </section>

        <section className="panel signal-panel concern-panel">
          <p className="panel-kicker">{tr('Evidence', 'الأدلة')}</p>
          <h2>{tr('Concerns', 'الملاحظات')}</h2>
          {detail.concerns.length ? <ul className="signal-list">{detail.concerns.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No concerns recorded.', 'لم يتم تسجيل ملاحظات.')}</p>}
        </section>

        <section className="panel span-two">
          <p className="panel-kicker">{tr('Traceability', 'التتبّع')}</p>
          <h2>{tr('Supporting evidence', 'الأدلة الداعمة')}</h2>
          {detail.evidence.length ? <ol className="evidence-list">{detail.evidence.map((item, index) => <li key={index}>{readableEvidence(item)}</li>)}</ol> : <p className="muted">{tr('No evidence excerpts were attached to this evaluation.', 'لم يتم إرفاق مقتطفات أدلة بهذا التقييم.')}</p>}
        </section>

        <section className="panel span-two">
          <p className="panel-kicker">{tr('Access state', 'حالة الوصول')}</p>
          <h2>{tr('Community access', 'الوصول إلى المجتمع')}</h2>
          {audit.access.length ? <pre className="audit-json" dir="ltr">{JSON.stringify(audit.access, null, 2)}</pre> : <p className="muted">{tr('No access operation exists. Approval will create the server-authoritative access request.', 'لا توجد عملية وصول حالياً. الاعتماد سينشئ طلب الوصول المعتمد من الخادم.')}</p>}
        </section>
      </div>

      <section className="decision-panel">
        <div>
          <p className="eyebrow">{tr('Human decision required', 'مطلوب قرار من المسؤول')}</p>
          <h2>{tr('Approve or reject this application', 'اعتماد أو رفض هذا الطلب')}</h2>
          <p className="muted">{tr('The rationale is stored with the administrator decision and audit history. AI scoring remains advisory.', 'يتم حفظ سبب القرار مع سجل المسؤول والتدقيق. تبقى نتيجة الذكاء الاصطناعي استشارية فقط.')}</p>
          <div className="decision-warning">{tr('This action changes the application state. Review the evidence before continuing.', 'هذا الإجراء يغيّر حالة الطلب. راجع الأدلة قبل المتابعة.')}</div>
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>
            {tr('Decision rationale', 'سبب القرار')}
            <textarea minLength={8} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Record a clear reason for this decision…', 'اكتب سبباً واضحاً لهذا القرار…')} />
            <small className={rationaleReady ? 'helper success-text' : 'helper'}>{rationaleReady ? tr('Rationale ready', 'السبب جاهز') : tr('Enter at least 8 characters', 'أدخل 8 أحرف على الأقل')}</small>
          </label>
          <div className="decision-actions">
            <button type="button" className="danger" disabled={busy || !rationaleReady} onClick={() => void decide('REJECT')}>{tr('Reject', 'رفض')}</button>
            <button type="button" className="primary" disabled={busy || !rationaleReady} onClick={() => void decide('APPROVE')}>{busy ? tr('Saving…', 'جارٍ الحفظ…') : tr('Approve & queue access', 'اعتماد وإرسال طلب الوصول')}</button>
          </div>
        </form>
      </section>
    </>
  );
}
