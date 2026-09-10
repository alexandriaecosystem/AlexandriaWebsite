import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConflictState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { ConfirmDialog, useToast } from '../components/Feedback';
import { useLanguage } from '../i18n/LanguageContext';
import {
  decideAdmission,
  getAdmissionDetail,
  getIdentificationUrl,
  reissueAdmissionForm,
  type AdmissionDetail,
  type AdmissionStage,
} from '../services/admission';
import { getApplicationAudit } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { ApplicationAuditDetail } from '../types/contracts';

type DecisionKind = 'SCORE_APPROVE' | 'SCORE_REJECT' | 'INFO_APPROVE' | 'INFO_CORRECTIONS' | 'INFO_REJECT';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readableEvidence(item: unknown) {
  if (typeof item === 'string') return item;
  const value = asRecord(item);
  if (value) return String(value.rationale ?? value.redacted_excerpt ?? value.summary ?? 'Evidence recorded');
  return String(item);
}

function formatDate(value: unknown, locale?: string) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function score(value: number | null) {
  return value == null ? '—' : `${Math.round(value)}/100`;
}

function latestAccessRecord(audit: ApplicationAuditDetail | null): Record<string, unknown> | null {
  if (!audit?.access.length) return null;
  const outer = asRecord(audit.access[audit.access.length - 1]);
  if (!outer) return null;
  return asRecord(outer.access) ?? outer;
}

function stageTone(stage: AdmissionStage) {
  if (stage === 'APPROVED') return 'positive';
  if (stage === 'NOT_READY') return 'negative';
  return 'neutral';
}

export function ReviewDetailPage() {
  const { tr, isArabic } = useLanguage();
  const { notify } = useToast();
  const { applicationId = '' } = useParams();
  const [detail, setDetail] = useState<AdmissionDetail>();
  const [audit, setAudit] = useState<ApplicationAuditDetail | null>(null);
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [idBusy, setIdBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [pendingDecision, setPendingDecision] = useState<DecisionKind | null>(null);

  useEffect(() => {
    let active = true;
    setError(false);
    setReason('');
    Promise.all([
      getAdmissionDetail(getSupabaseClient(), applicationId),
      getApplicationAudit(getSupabaseClient(), applicationId).catch(() => null),
    ])
      .then(([nextDetail, nextAudit]) => {
        if (!active) return;
        setDetail(nextDetail);
        setAudit(nextAudit);
      })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [applicationId, reload]);

  const stageLabel = (value: AdmissionStage) => ({
    SCORE_REVIEW: tr('Assessment review', 'مراجعة التقييم'),
    FORM_PENDING: tr('Awaiting information', 'بانتظار المعلومات'),
    INFORMATION_REVIEW: tr('Information review', 'مراجعة المعلومات'),
    CORRECTIONS_REQUIRED: tr('Awaiting corrected information', 'بانتظار المعلومات المصححة'),
    APPROVED: tr('Final approval', 'الموافقة النهائية'),
    NOT_READY: tr('Deferred / declined', 'مؤجل / مرفوض'),
  }[value] ?? value.replaceAll('_', ' '));

  const accessLabel = (value: unknown) => ({
    GENERAL: tr('Public community only', 'المجتمع العام فقط'),
    PENDING_REVIEW: tr('Internal review pending', 'المراجعة الداخلية معلقة'),
    APPROVED: tr('Final approval complete — invite queued', 'اكتملت الموافقة النهائية — الدعوة في قائمة الإرسال'),
    INVITE_SENT: tr('Invite delivered', 'تم تسليم الدعوة'),
    JOIN_REQUESTED: tr('Join request received', 'تم استلام طلب الانضمام'),
    ACTIVE: tr('Active private member', 'عضو خاص نشط'),
    LEFT: tr('Left private community', 'غادر المجتمع الخاص'),
    REMOVED: tr('Removed from private community', 'تمت إزالته من المجتمع الخاص'),
    FAILED: tr('Invite delivery failed', 'فشل تسليم الدعوة'),
  }[String(value ?? 'GENERAL')] ?? String(value ?? 'GENERAL').replaceAll('_', ' '));

  const decisionConfig = useMemo(() => {
    if (!pendingDecision) return null;
    switch (pendingDecision) {
      case 'SCORE_APPROVE': return { stage: 'SCORE_REVIEW' as const, decision: 'APPROVE' as const, title: tr('Request participant information?', 'طلب معلومات المشارك؟'), confirm: tr('Confirm request', 'تأكيد الطلب'), success: tr('Assessment approved. The participant can be invited to submit information.', 'تمت الموافقة على التقييم. يمكن دعوة المشارك لتقديم المعلومات.') };
      case 'SCORE_REJECT': return { stage: 'SCORE_REVIEW' as const, decision: 'REJECT' as const, title: tr('Defer or decline this participant?', 'تأجيل أو رفض هذا المشارك؟'), confirm: tr('Confirm defer / decline', 'تأكيد التأجيل / الرفض'), success: tr('Assessment decision saved.', 'تم حفظ قرار التقييم.') };
      case 'INFO_APPROVE': return { stage: 'INFORMATION_REVIEW' as const, decision: 'APPROVE' as const, title: tr('Approve private access?', 'الموافقة على الوصول الخاص؟'), confirm: tr('Confirm final approval', 'تأكيد الموافقة النهائية'), success: tr('Final approval saved. Private access delivery can now proceed through the protected backend flow.', 'تم حفظ الموافقة النهائية. يمكن الآن متابعة تسليم الوصول الخاص عبر مسار الخلفية المحمي.') };
      case 'INFO_CORRECTIONS': return { stage: 'INFORMATION_REVIEW' as const, decision: 'CORRECTIONS' as const, title: tr('Request corrected information?', 'طلب معلومات مصححة؟'), confirm: tr('Confirm corrections request', 'تأكيد طلب التصحيح'), success: tr('Corrections requested.', 'تم طلب التصحيحات.') };
      case 'INFO_REJECT': return { stage: 'INFORMATION_REVIEW' as const, decision: 'REJECT' as const, title: tr('Reject private access?', 'رفض الوصول الخاص؟'), confirm: tr('Confirm rejection', 'تأكيد الرفض'), success: tr('Final information review rejected.', 'تم رفض مراجعة المعلومات النهائية.') };
    }
  }, [pendingDecision, tr]);

  async function saveDecision() {
    if (!detail || !decisionConfig || reason.trim().length < 8 || busy) return;
    setBusy(true);
    try {
      await decideAdmission(getSupabaseClient(), {
        applicationId: detail.applicationId,
        stage: decisionConfig.stage,
        decision: decisionConfig.decision,
        reason: reason.trim(),
        version: detail.version,
      });
      notify({ tone: 'success', title: tr('Decision saved', 'تم حفظ القرار'), message: decisionConfig.success });
      setPendingDecision(null);
      setReload((value) => value + 1);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (/STALE|CONFLICT|VERSION|stage/i.test(message)) {
        setConflict(true);
      } else {
        notify({ tone: 'error', title: tr('Decision could not be saved', 'تعذر حفظ القرار'), message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function reissueForm() {
    if (!detail || busy || detail.formOriginConfigured === false) return;
    setBusy(true);
    try {
      await reissueAdmissionForm(getSupabaseClient(), detail.applicationId, detail.version);
      notify({ tone: 'success', title: tr('Information request reissued', 'تمت إعادة إصدار طلب المعلومات'), message: tr('A new protected one-use submission request was queued by the backend.', 'وضعت الخلفية طلب تقديم محمي جديد للاستخدام مرة واحدة في قائمة الإرسال.') });
      setReload((value) => value + 1);
    } catch (caught) {
      notify({ tone: 'error', title: tr('Could not reissue information request', 'تعذرت إعادة إصدار طلب المعلومات'), message: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setBusy(false);
    }
  }

  async function openIdentification() {
    if (!detail?.information?.hasIdentification || idBusy) return;
    setIdBusy(true);
    try {
      const url = await getIdentificationUrl(getSupabaseClient(), detail.applicationId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      notify({ tone: 'error', title: tr('Identification could not be opened', 'تعذر فتح مستند الهوية'), message: caught instanceof Error ? caught.message : String(caught) });
    } finally {
      setIdBusy(false);
    }
  }

  if (conflict) return <ConflictState onReload={() => { setConflict(false); setReload((n) => n + 1); }} />;
  if (error) return <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />;
  if (!detail) return <LoadingState label={tr('Loading admission review', 'جارٍ تحميل مراجعة القبول')} />;

  const rationaleReady = reason.trim().length >= 8;
  const latestAccess = latestAccessRecord(audit);
  const canRequestInformation = detail.formOriginConfigured !== false;
  const locale = isArabic ? 'ar-LB' : undefined;

  return (
    <>
      <Link className="back-link" to="/reviews">← {tr('Admission reviews', 'مراجعات القبول')}</Link>

      <header className="page-header detail-header">
        <div>
          <p className="eyebrow">{tr('VIP admission', 'قبول VIP')}</p>
          <h1>{tr('Participant review', 'مراجعة المشارك')}</h1>
          <div className="detail-meta">
            <span className={`platform ${detail.platform}`} dir="ltr">{detail.platform}</span>
            <span className={`status-pill ${stageTone(detail.stage)}`}>{stageLabel(detail.stage)}</span>
          </div>
        </div>
        <div className="score-ring" aria-label={tr(`Combined backend score ${score(detail.totalScore)}`, `النتيجة المجمعة من الخلفية ${score(detail.totalScore)}`)}><strong>{detail.totalScore == null ? '—' : Math.round(detail.totalScore)}</strong><span>{tr('/100 combined', '/100 مجمعة')}</span></div>
      </header>

      <ol className="operational-flow" aria-label={tr('VIP admission stages', 'مراحل قبول VIP')}>
        <li>{tr('Assessment review', 'مراجعة التقييم')}</li>
        <li>{tr('Awaiting information', 'بانتظار المعلومات')}</li>
        <li>{tr('Information review', 'مراجعة المعلومات')}</li>
        <li>{tr('Final approval', 'الموافقة النهائية')}</li>
        <li>{tr('Invite delivery / membership', 'تسليم الدعوة / العضوية')}</li>
      </ol>

      <div className="detail-grid">
        <section className="panel">
          <p className="panel-kicker">{tr('Internal assessment', 'التقييم الداخلي')}</p>
          <h2>{tr('Backend scores', 'نتائج الخلفية')}</h2>
          <dl className="profile-list access-detail-list">
            <div><dt>{tr('Quiz (70%)', 'الاختبار (70٪)')}</dt><dd><strong>{score(detail.quizScore)}</strong></dd></div>
            <div><dt>{tr('Crypto understanding (30%)', 'فهم العملات الرقمية (30٪)')}</dt><dd><strong>{score(detail.personaScore)}</strong></dd></div>
            <div><dt>{tr('Combined', 'المجمعة')}</dt><dd><strong>{score(detail.totalScore)}</strong></dd></div>
          </dl>
          <p className="muted">{tr('All three values are read from the admission backend. The browser does not calculate eligibility or grant access from a score.', 'تتم قراءة القيم الثلاث من خلفية القبول. لا يحسب المتصفح الأهلية ولا يمنح الوصول بناءً على النتيجة.')}</p>
        </section>

        <section className="panel">
          <p className="panel-kicker">{tr('Demonstrated understanding', 'الفهم المثبت')}</p>
          <h2>{tr('Crypto discussion summary', 'ملخص نقاش العملات الرقمية')}</h2>
          <p>{detail.personaSummary || tr('No crypto-understanding summary is available yet.', 'لا يتوفر ملخص لفهم العملات الرقمية حتى الآن.')}</p>
        </section>

        <section className="panel span-two">
          <p className="panel-kicker">{tr('Supporting evidence', 'الأدلة الداعمة')}</p>
          <h2>{tr('Assessment evidence', 'أدلة التقييم')}</h2>
          {detail.personaEvidence.length ? <ol className="evidence-list">{detail.personaEvidence.map((item, index) => <li key={index}>{readableEvidence(item)}</li>)}</ol> : <p className="muted">{tr('No supporting evidence was attached to the latest crypto-understanding assessment.', 'لم تُرفق أدلة داعمة بأحدث تقييم لفهم العملات الرقمية.')}</p>}
        </section>

        {detail.information && <section className="panel span-two">
          <p className="panel-kicker">{tr('Second review', 'المراجعة الثانية')}</p>
          <h2>{tr('Submitted participant information', 'معلومات المشارك المقدمة')}</h2>
          <dl className="profile-list access-detail-list">
            <div><dt>{tr('First name', 'الاسم الأول')}</dt><dd>{detail.information.firstName || '—'}</dd></div>
            <div><dt>{tr('Last name', 'اسم العائلة')}</dt><dd>{detail.information.lastName || '—'}</dd></div>
            <div><dt>{tr('Email', 'البريد الإلكتروني')}</dt><dd dir="ltr">{detail.information.email || '—'}</dd></div>
            <div><dt>{tr('Country of residence', 'بلد الإقامة')}</dt><dd>{detail.information.country || '—'}</dd></div>
            <div><dt>{tr('Phone number', 'رقم الهاتف')}</dt><dd dir="ltr">{detail.information.phone || '—'}</dd></div>
            <div><dt>X</dt><dd dir="ltr">{detail.information.xHandle || '—'}</dd></div>
            <div><dt>Telegram</dt><dd dir="ltr">{detail.information.telegramId || '—'}</dd></div>
            <div><dt>{tr('Submitted', 'تاريخ التقديم')}</dt><dd>{formatDate(detail.information.submittedAt, locale)}</dd></div>
          </dl>
          {detail.information.hasIdentification ? <button type="button" className="secondary" disabled={idBusy} onClick={() => void openIdentification()}>{idBusy ? tr('Opening protected document…', 'جارٍ فتح المستند المحمي…') : tr('View identification', 'عرض مستند الهوية')}</button> : <p className="muted">{tr('No identification document is attached.', 'لا يوجد مستند هوية مرفق.')}</p>}
          <p className="muted">{tr('Identification is retrieved only through the authorized admin Edge Function as a short-lived signed URL. The storage path is never exposed here.', 'يتم استرجاع مستند الهوية فقط عبر Edge Function المصرح بها للمسؤول كرابط موقّع قصير العمر. لا يتم عرض مسار التخزين هنا.')}</p>
        </section>}

        <section className="panel span-two">
          <p className="panel-kicker">{tr('Access lifecycle', 'دورة حياة الوصول')}</p>
          <h2>{tr('Private community status', 'حالة المجتمع الخاص')}</h2>
          {latestAccess ? <dl className="profile-list access-detail-list">
            <div><dt>{tr('Access state', 'حالة الوصول')}</dt><dd><span className="status-pill neutral">{accessLabel(latestAccess.state ?? latestAccess.new_state)}</span></dd></div>
            <div><dt>{tr('Invite delivered', 'تم تسليم الدعوة')}</dt><dd>{formatDate(latestAccess.invite_sent_at, locale)}</dd></div>
            <div><dt>{tr('Actual membership activated', 'تم تفعيل العضوية الفعلية')}</dt><dd>{formatDate(latestAccess.activated_at, locale)}</dd></div>
            <div><dt>{tr('Last error', 'آخر خطأ')}</dt><dd>{latestAccess.last_error ? String(latestAccess.last_error) : '—'}</dd></div>
          </dl> : <p className="muted">{tr('No private access record exists yet. Assessment approval alone does not create membership.', 'لا يوجد سجل وصول خاص حتى الآن. الموافقة على التقييم وحدها لا تنشئ عضوية.')}</p>}
        </section>

        {detail.history.length > 0 && <section className="panel span-two">
          <p className="panel-kicker">{tr('Audit history', 'سجل التدقيق')}</p>
          <h2>{tr('Human decisions', 'القرارات البشرية')}</h2>
          <ol className="evidence-list">{detail.history.map((item, index) => <li key={`${item.createdAt}-${index}`}><strong>{item.decision.replaceAll('_', ' ')}</strong> — {item.reason} <span className="muted">{formatDate(item.createdAt, locale)}</span></li>)}</ol>
        </section>}
      </div>

      {detail.stage === 'SCORE_REVIEW' && <section className="decision-panel">
        <div>
          <p className="eyebrow">{tr('First human review', 'المراجعة البشرية الأولى')}</p>
          <h2>{tr('Review the assessment', 'راجع التقييم')}</h2>
          <p className="muted">{tr('Choose whether to request participant information or defer/decline. A high score never grants access automatically.', 'اختر ما إذا كنت ستطلب معلومات المشارك أو تؤجل/ترفض. النتيجة المرتفعة لا تمنح الوصول تلقائيًا أبدًا.')}</p>
          {!canRequestInformation && <div className="decision-warning">{tr('Request information is unavailable because admission_settings.form_origin is not configured in the live backend.', 'طلب المعلومات غير متاح لأن admission_settings.form_origin غير مهيأ في الخلفية الحالية.')}</div>}
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>{tr('Decision rationale', 'سبب القرار')}<textarea aria-label="Decision rationale" minLength={8} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Record a clear reason for this decision…', 'اكتب سبباً واضحاً لهذا القرار…')} /><small className={rationaleReady ? 'helper success-text' : 'helper'}>{rationaleReady ? tr('Rationale ready', 'السبب جاهز') : tr('Enter at least 8 characters', 'أدخل 8 أحرف على الأقل')}</small></label>
          <div className="decision-actions">
            <button type="button" className="danger" disabled={busy || !rationaleReady} onClick={() => setPendingDecision('SCORE_REJECT')}>{tr('Defer / decline', 'تأجيل / رفض')}</button>
            <button type="button" className="primary" disabled={busy || !rationaleReady || !canRequestInformation} onClick={() => setPendingDecision('SCORE_APPROVE')}>{tr('Request information', 'طلب المعلومات')}</button>
          </div>
        </form>
      </section>}

      {detail.stage === 'INFORMATION_REVIEW' && <section className="decision-panel">
        <div>
          <p className="eyebrow">{tr('Second human review', 'المراجعة البشرية الثانية')}</p>
          <h2>{tr('Verify information and decide private access', 'تحقق من المعلومات وقرر الوصول الخاص')}</h2>
          <p className="muted">{tr('Final approval is a separate admin decision. Only this stage can approve private access.', 'الموافقة النهائية قرار منفصل للمسؤول. هذه المرحلة فقط يمكنها الموافقة على الوصول الخاص.')}</p>
        </div>
        <form onSubmit={(event) => event.preventDefault()}>
          <label>{tr('Decision rationale', 'سبب القرار')}<textarea aria-label="Decision rationale" minLength={8} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Record a clear reason for this decision…', 'اكتب سبباً واضحاً لهذا القرار…')} /></label>
          <div className="decision-actions">
            <button type="button" className="danger" disabled={busy || !rationaleReady} onClick={() => setPendingDecision('INFO_REJECT')}>{tr('Reject private access', 'رفض الوصول الخاص')}</button>
            <button type="button" className="secondary" disabled={busy || !rationaleReady} onClick={() => setPendingDecision('INFO_CORRECTIONS')}>{tr('Request corrections', 'طلب تصحيحات')}</button>
            <button type="button" className="primary" disabled={busy || !rationaleReady} onClick={() => setPendingDecision('INFO_APPROVE')}>{tr('Approve private access', 'الموافقة على الوصول الخاص')}</button>
          </div>
        </form>
      </section>}

      {(detail.stage === 'FORM_PENDING' || detail.stage === 'CORRECTIONS_REQUIRED') && <section className="decision-panel">
        <div>
          <p className="eyebrow">{tr('Awaiting participant', 'بانتظار المشارك')}</p>
          <h2>{stageLabel(detail.stage)}</h2>
          <p className="muted">{tr('No final access decision can be made at this stage. Wait for the protected information submission.', 'لا يمكن اتخاذ قرار نهائي بشأن الوصول في هذه المرحلة. انتظر تقديم المعلومات عبر المسار المحمي.')}</p>
          {detail.formOriginConfigured === false && <div className="decision-warning">{tr('The submission form origin is not configured, so the request cannot be reissued.', 'أصل نموذج التقديم غير مهيأ، لذلك لا يمكن إعادة إصدار الطلب.')}</div>}
        </div>
        <div className="decision-actions"><button type="button" className="secondary" disabled={busy || detail.formOriginConfigured === false} onClick={() => void reissueForm()}>{tr('Reissue information request', 'إعادة إصدار طلب المعلومات')}</button></div>
      </section>}

      {detail.stage === 'APPROVED' && <section className="panel"><p className="panel-kicker">{tr('Final approval complete', 'اكتملت الموافقة النهائية')}</p><h2>{tr('Access delivery is separate from membership', 'تسليم الوصول منفصل عن العضوية')}</h2><p className="muted">{tr('Use the access lifecycle above to distinguish approval, invite delivery, join request and actual active membership.', 'استخدم دورة حياة الوصول أعلاه للتمييز بين الموافقة وتسليم الدعوة وطلب الانضمام والعضوية النشطة الفعلية.')}</p></section>}
      {detail.stage === 'NOT_READY' && <section className="panel"><p className="panel-kicker">{tr('Assessment closed', 'أُغلِق التقييم')}</p><h2>{tr('Deferred / declined', 'مؤجل / مرفوض')}</h2><p className="muted">{tr('No private access was granted from this assessment.', 'لم يتم منح وصول خاص من هذا التقييم.')}</p></section>}

      <ConfirmDialog
        open={Boolean(decisionConfig)}
        title={decisionConfig?.title ?? ''}
        message={<p><strong>{tr('Decision rationale', 'سبب القرار')}:</strong> {reason.trim()}</p>}
        confirmLabel={busy ? tr('Saving…', 'جارٍ الحفظ…') : decisionConfig?.confirm ?? tr('Confirm', 'تأكيد')}
        cancelLabel={tr('Back to review', 'العودة للمراجعة')}
        tone={pendingDecision === 'SCORE_REJECT' || pendingDecision === 'INFO_REJECT' ? 'danger' : 'primary'}
        busy={busy}
        onCancel={() => setPendingDecision(null)}
        onConfirm={() => void saveDecision()}
      />
    </>
  );
}
