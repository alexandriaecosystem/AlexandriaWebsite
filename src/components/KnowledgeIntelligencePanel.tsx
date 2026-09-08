import { useEffect, useMemo, useState } from 'react';
import {
  getKnowledgeIntelligenceStatus,
  listKnowledgeCandidates,
  listKnowledgeConflicts,
  promoteKnowledgeCandidate,
  rejectKnowledgeCandidate,
  resolveKnowledgeConflict,
} from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { KnowledgeCandidate, KnowledgeConflict, KnowledgeIntelligenceStatus } from '../types/contracts';
import { ConfirmDialog, useToast } from './Feedback';
import { useLanguage } from '../i18n/LanguageContext';

type ReviewAction =
  | { kind: 'conflict'; conflict: KnowledgeConflict; action: 'KEEP_SOURCE_A' | 'KEEP_SOURCE_B' | 'DISMISS_FALSE_CONFLICT' }
  | { kind: 'promote'; candidate: KnowledgeCandidate }
  | { kind: 'reject'; candidate: KnowledgeCandidate }
  | null;

const activeConflict = (item: KnowledgeConflict) => ['OPEN', 'REVIEW_REQUIRED'].includes(item.status);

export function KnowledgeIntelligencePanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const { tr, isArabic } = useLanguage();
  const { notify } = useToast();
  const [status, setStatus] = useState<KnowledgeIntelligenceStatus>();
  const [conflicts, setConflicts] = useState<KnowledgeConflict[]>([]);
  const [candidates, setCandidates] = useState<KnowledgeCandidate[]>([]);
  const [error, setError] = useState(false);
  const [localRefresh, setLocalRefresh] = useState(0);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    const client = getSupabaseClient();
    Promise.all([
      getKnowledgeIntelligenceStatus(client),
      listKnowledgeConflicts(client),
      listKnowledgeCandidates(client, 'PENDING'),
    ]).then(([nextStatus, nextConflicts, nextCandidates]) => {
      if (cancelled) return;
      setStatus(nextStatus);
      setConflicts(nextConflicts.items.filter(activeConflict));
      setCandidates(nextCandidates.items);
    }).catch(() => {
      if (!cancelled) setError(true);
    });
    return () => { cancelled = true; };
  }, [refreshKey, localRefresh]);

  const activeSources = useMemo(() => status?.officialSourceHealth.filter((source) => source.isActive) ?? [], [status]);
  const indexedSources = useMemo(() => activeSources.filter((source) => (
    source.extractionStatus === 'READY'
    && source.conflictScanStatus === 'READY'
    && source.conflictScannedVersion === source.currentVersion
  )), [activeSources]);
  const unhealthySources = useMemo(() => activeSources.filter((source) => (
    source.extractionStatus !== 'READY'
    || source.conflictScanStatus !== 'READY'
    || source.conflictScannedVersion !== source.currentVersion
    || source.isStale
    || source.hasBlockingConflict
    || Boolean(source.lastError)
  )), [activeSources]);

  async function performReviewAction() {
    if (!reviewAction || busy) return;
    setBusy(true);
    try {
      const client = getSupabaseClient();
      if (reviewAction.kind === 'conflict') {
        await resolveKnowledgeConflict(
          client,
          reviewAction.conflict.id,
          reviewAction.action as unknown as 'RESOLVE',
          'Reviewed and explicitly confirmed by an administrator in Knowledge Intelligence.',
        );
        notify({ tone: 'success', title: tr('Conflict review saved', 'تم حفظ مراجعة التعارض') });
      } else if (reviewAction.kind === 'promote') {
        await promoteKnowledgeCandidate(client, reviewAction.candidate.id);
        notify({
          tone: 'success',
          title: tr('Candidate promoted for knowledge processing', 'تمت ترقية المرشح لمعالجة المعرفة'),
          message: tr('It still must complete processing, contradiction scanning and normal approval before the assistant can use it.', 'لا يزال يجب أن يكمل المعالجة وفحص التعارض والاعتماد العادي قبل أن يتمكن المساعد من استخدامه.'),
        });
      } else {
        await rejectKnowledgeCandidate(client, reviewAction.candidate.id, 'Rejected by administrator after Knowledge Intelligence review.');
        notify({ tone: 'success', title: tr('Candidate rejected', 'تم رفض المرشح') });
      }
      setReviewAction(null);
      setLocalRefresh((value) => value + 1);
    } catch (caught) {
      notify({
        tone: 'error',
        title: tr('Review action failed', 'فشل إجراء المراجعة'),
        message: caught instanceof Error ? caught.message : tr('The review action could not be saved.', 'تعذر حفظ إجراء المراجعة.'),
      });
    } finally {
      setBusy(false);
    }
  }

  const confirmTitle = reviewAction?.kind === 'conflict'
    ? reviewAction.action === 'DISMISS_FALSE_CONFLICT'
      ? tr('Dismiss this as a false conflict?', 'تجاهل هذا كتعارض غير صحيح؟')
      : reviewAction.action === 'KEEP_SOURCE_A'
        ? tr('Keep Source A as authoritative?', 'اعتماد المصدر أ كمرجع؟')
        : tr('Keep Source B as authoritative?', 'اعتماد المصدر ب كمرجع؟')
    : reviewAction?.kind === 'promote'
      ? tr('Promote this knowledge candidate?', 'ترقية مرشح المعرفة هذا؟')
      : tr('Reject this knowledge candidate?', 'رفض مرشح المعرفة هذا؟');

  const confirmMessage = reviewAction?.kind === 'conflict'
    ? tr('This is an administrative resolution. It changes the conflict state and may affect which verified knowledge can be used.', 'هذا حل إداري للتعارض. سيغير حالة التعارض وقد يؤثر على المعرفة الموثقة التي يمكن استخدامها.')
    : reviewAction?.kind === 'promote'
      ? tr('Promotion does not auto-approve the answer. It creates knowledge that must still pass the normal processing and safety gates.', 'الترقية لا تعتمد الإجابة تلقائياً. ستنشئ معرفة يجب أن تمر بمراحل المعالجة والسلامة العادية.')
      : tr('The candidate will remain recorded but will not be promoted into the knowledge base.', 'سيبقى المرشح مسجلاً لكنه لن يُرقّى إلى قاعدة المعرفة.');

  return (
    <section className="panel" aria-label={tr('Knowledge Intelligence', 'ذكاء المعرفة')}>
      <div className="toolbar-row">
        <div>
          <p className="eyebrow">{tr('Knowledge Intelligence', 'ذكاء المعرفة')}</p>
          <h2>{tr('Official sources & contradiction safety', 'المصادر الرسمية وسلامة التعارض')}</h2>
          <p className="muted">{tr('A simple view of official-source health, conflicts, candidates and source changes.', 'عرض مبسط لصحة المصادر الرسمية والتعارضات والمرشحين وتغييرات المصادر.')}</p>
        </div>
        <button type="button" className="compact-button" disabled={busy} onClick={() => setLocalRefresh((value) => value + 1)}>{tr('Refresh', 'تحديث')}</button>
      </div>

      {error && <p className="form-error" role="alert">{tr('Knowledge Intelligence status could not be loaded.', 'تعذر تحميل حالة ذكاء المعرفة.')}</p>}
      {!status && !error && <p className="muted">{tr('Loading Knowledge Intelligence…', 'جارٍ تحميل ذكاء المعرفة…')}</p>}

      {status && (
        <>
          <div className="knowledge-state-grid">
            <article className="metric-card knowledge-stage-card"><span>{tr('Official pages indexed', 'الصفحات الرسمية المفهرسة')}</span><strong>{indexedSources.length}/{activeSources.length}</strong><small>{tr('Ready + current contradiction scan', 'جاهزة + فحص تعارض حالي')}</small></article>
            <article className="metric-card knowledge-stage-card"><span>{tr('Stale official pages', 'الصفحات الرسمية القديمة')}</span><strong>{status.staleSources}</strong><small>{tr('Require refresh before freshness-sensitive answers', 'تحتاج تحديثاً قبل الإجابات الحساسة للحداثة')}</small></article>
            <article className="metric-card knowledge-stage-card"><span>{tr('Blocking conflicts', 'تعارضات مانعة')}</span><strong>{status.blockingConflicts}</strong><small>{tr('Fail closed until reviewed', 'يتم الحجب حتى المراجعة')}</small></article>
            <article className="metric-card knowledge-stage-card"><span>{tr('Pending candidates', 'مرشحون قيد المراجعة')}</span><strong>{status.pendingCandidates}</strong><small>{tr('Official evidence found outside approved KB', 'دليل رسمي تم العثور عليه خارج قاعدة المعرفة المعتمدة')}</small></article>
          </div>

          {activeSources.length > 0 && indexedSources.length === 0 && (
            <p className="form-note">{tr('The official-source registry is configured, but the first authorized bootstrap crawl has not indexed any page yet.', 'سجل المصادر الرسمية مهيأ، لكن أول زحف تمهيدي مصرح به لم يفهرس أي صفحة بعد.')}</p>
          )}

          <details className="document-details" open={unhealthySources.length > 0}>
            <summary>{tr('Official source health', 'صحة المصادر الرسمية')} · {unhealthySources.length ? tr(`${unhealthySources.length} need attention`, `${unhealthySources.length} تحتاج إلى انتباه`) : tr('healthy', 'سليمة')}</summary>
            <div className="document-list">
              {(unhealthySources.length ? unhealthySources : activeSources.slice(0, 8)).map((source) => {
                const ready = source.extractionStatus === 'READY' && source.conflictScanStatus === 'READY' && source.conflictScannedVersion === source.currentVersion;
                const state = source.hasBlockingConflict ? tr('Conflict', 'تعارض') : source.isStale ? tr('Stale', 'قديم') : ready ? tr('Indexed', 'مفهرس') : source.extractionStatus === 'FAILED' ? tr('Failed', 'فشل') : tr('Awaiting index', 'بانتظار الفهرسة');
                return (
                  <article className="document-card compact-document" key={source.sourceId}>
                    <div className="document-head">
                      <div className="document-heading-copy"><h3>{source.pageTitle}</h3><p className="muted">{source.authorityCode.replaceAll('_', ' ')} · {source.language.toUpperCase()}</p></div>
                      <span className={`status-pill ${ready && !source.isStale && !source.hasBlockingConflict ? 'healthy' : source.hasBlockingConflict || source.extractionStatus === 'FAILED' ? 'negative' : 'neutral'}`}>{state}</span>
                    </div>
                    <p className="muted" dir="ltr">{source.canonicalUrl}</p>
                    {source.lastError && <p className="form-error">{source.lastError}</p>}
                    <small>{tr('Conflict scan', 'فحص التعارض')}: {source.conflictScanStatus} · {tr('Version', 'الإصدار')}: {source.currentVersion}</small>
                  </article>
                );
              })}
            </div>
          </details>

          <details className="document-details" open={conflicts.length > 0}>
            <summary>{tr('Contradictions requiring review', 'تعارضات تحتاج إلى مراجعة')} · {conflicts.length}</summary>
            {conflicts.length === 0 ? <p className="muted">{tr('No unresolved contradictions.', 'لا توجد تعارضات غير محلولة.')}</p> : (
              <div className="document-list">{conflicts.slice(0, 20).map((conflict) => (
                <article className="document-card compact-document" key={conflict.id}>
                  <div className="document-head"><div className="document-heading-copy"><h3>{conflict.topic || tr('Knowledge contradiction', 'تعارض معرفي')}</h3><p className="muted">{tr('Severity', 'الخطورة')}: {conflict.severity} · {tr('Confidence', 'الثقة')}: {Math.round(conflict.confidence * 100)}%</p></div><span className={`status-pill ${conflict.blocking ? 'negative' : 'neutral'}`}>{conflict.blocking ? tr('Approval blocked', 'الاعتماد محجوب') : tr('Review', 'مراجعة')}</span></div>
                  <div className="document-metadata">
                    <div><dt>{tr('Source A', 'المصدر أ')}</dt><dd>{conflict.sourceATitle}<br /><small>{conflict.authorityALabel || conflict.authorityACode || tr('Authority unavailable', 'المرجعية غير متاحة')}</small></dd></div>
                    <div><dt>{tr('Claim A', 'الادعاء أ')}</dt><dd>{conflict.claimA}</dd></div>
                    <div><dt>{tr('Source B', 'المصدر ب')}</dt><dd>{conflict.sourceBTitle}<br /><small>{conflict.authorityBLabel || conflict.authorityBCode || tr('Authority unavailable', 'المرجعية غير متاحة')}</small></dd></div>
                    <div><dt>{tr('Claim B', 'الادعاء ب')}</dt><dd>{conflict.claimB}</dd></div>
                  </div>
                  {conflict.explanation && <p className="muted">{conflict.explanation}</p>}
                  <div className="document-primary-actions">
                    <button type="button" className="compact-button" disabled={busy} onClick={() => setReviewAction({ kind: 'conflict', conflict, action: 'KEEP_SOURCE_A' })}>{tr('Keep Source A', 'اعتماد المصدر أ')}</button>
                    <button type="button" className="compact-button" disabled={busy} onClick={() => setReviewAction({ kind: 'conflict', conflict, action: 'KEEP_SOURCE_B' })}>{tr('Keep Source B', 'اعتماد المصدر ب')}</button>
                    <button type="button" className="compact-button" disabled={busy} onClick={() => setReviewAction({ kind: 'conflict', conflict, action: 'DISMISS_FALSE_CONFLICT' })}>{tr('False conflict', 'تعارض غير صحيح')}</button>
                  </div>
                </article>
              ))}</div>
            )}
          </details>

          <details className="document-details" open={candidates.length > 0}>
            <summary>{tr('Pending official-source candidates', 'مرشحو المصادر الرسمية قيد المراجعة')} · {candidates.length}</summary>
            {candidates.length === 0 ? <p className="muted">{tr('No pending candidates.', 'لا يوجد مرشحون قيد المراجعة.')}</p> : (
              <div className="document-list">{candidates.slice(0, 20).map((candidate) => (
                <article className="document-card compact-document" key={candidate.id}>
                  <div className="document-head"><div className="document-heading-copy"><h3>{candidate.originalQuestion}</h3><p className="muted">{candidate.sourceTitle} · {candidate.authorityCode?.replaceAll('_', ' ') || tr('Official source', 'مصدر رسمي')}</p></div><span className="status-pill neutral">{tr('Pending', 'قيد المراجعة')}</span></div>
                  <p><strong>{tr('Proposed answer', 'الإجابة المقترحة')}:</strong> {candidate.proposedAnswer}</p>
                  <p className="muted" dir="ltr">{candidate.sourceUrl}</p>
                  <div className="document-primary-actions">
                    <button type="button" className="compact-button primary" disabled={busy} onClick={() => setReviewAction({ kind: 'promote', candidate })}>{tr('Promote to KB review', 'ترقية لمراجعة قاعدة المعرفة')}</button>
                    <button type="button" className="compact-button" disabled={busy} onClick={() => setReviewAction({ kind: 'reject', candidate })}>{tr('Reject', 'رفض')}</button>
                  </div>
                </article>
              ))}</div>
            )}
          </details>

          <details className="document-details">
            <summary>{tr('Latest official-source changes', 'أحدث تغييرات المصادر الرسمية')} · {status.recentSourceChanges.length}</summary>
            {status.recentSourceChanges.length === 0 ? <p className="muted">{tr('No source changes have been recorded yet.', 'لم يتم تسجيل تغييرات في المصادر بعد.')}</p> : (
              <div className="document-list">{status.recentSourceChanges.map((change) => (
                <article className="document-card compact-document" key={change.id}>
                  <div className="document-head"><div className="document-heading-copy"><h3>{change.sourceTitle}</h3><p className="muted">{change.changeKind.replaceAll('_', ' ')} · {new Date(change.detectedAt).toLocaleString(isArabic ? 'ar-LB' : undefined)}</p></div>{change.important && <span className="status-pill neutral">{tr('Important', 'مهم')}</span>}</div>
                  {change.changeSummary && <p>{change.changeSummary}</p>}
                  <small>{tr('Version', 'الإصدار')} {change.previousVersion ?? '—'} → {change.currentVersion} · {tr('Conflicts', 'التعارضات')}: {change.conflictCount}</small>
                </article>
              ))}</div>
            )}
          </details>
        </>
      )}

      <ConfirmDialog
        open={Boolean(reviewAction)}
        title={confirmTitle}
        message={<p>{confirmMessage}</p>}
        confirmLabel={tr('Confirm review action', 'تأكيد إجراء المراجعة')}
        cancelLabel={tr('Cancel', 'إلغاء')}
        tone={reviewAction?.kind === 'reject' ? 'danger' : 'primary'}
        busy={busy}
        onCancel={() => setReviewAction(null)}
        onConfirm={() => void performReviewAction()}
      />
    </section>
  );
}
