import { useEffect, useState } from 'react';
import {
  answerKnowledgeGap,
  ignoreKnowledgeGap,
  listKnowledgeGaps,
  reopenKnowledgeGap,
  type KnowledgeGap,
  type KnowledgeGapStatus,
} from '../services/knowledge-gaps';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import '../admin-operations.css';
import '../knowledge-gaps-admin.css';

const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

function Status({ value }: { value: KnowledgeGapStatus }) {
  const tone = value === 'RESOLVED' ? 'positive' : value === 'OPEN' ? 'neutral' : 'negative';
  return <span className={`status-pill ${tone}`}>{value}</span>;
}

export function KnowledgeGapsPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<KnowledgeGap[]>([]);
  const [status, setStatus] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [editingGapId, setEditingGapId] = useState<string | null>(null);
  const [answerDraft, setAnswerDraft] = useState('');
  const [savingGapId, setSavingGapId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void listKnowledgeGaps(getSupabaseClient(), status)
      .then((result) => { if (active) setItems(result.items); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load knowledge gaps.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, reload]);

  function beginEdit(gap: KnowledgeGap) {
    setEditingGapId(gap.id);
    setAnswerDraft(gap.adminAnswer ?? '');
    setError('');
  }

  function cancelEdit() {
    setEditingGapId(null);
    setAnswerDraft('');
  }

  async function saveAnswer(gap: KnowledgeGap) {
    const answer = answerDraft.trim();
    if (answer.length < 2) {
      setError(tr('Enter a trusted answer before saving.', 'أدخل إجابة موثوقة قبل الحفظ.'));
      return;
    }
    setSavingGapId(gap.id);
    setError('');
    try {
      await answerKnowledgeGap(getSupabaseClient(), gap.id, answer);
      cancelEdit();
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not save the answer.', 'تعذر حفظ الإجابة.'));
    } finally {
      setSavingGapId(null);
    }
  }

  async function ignoreGap(gap: KnowledgeGap) {
    setError('');
    try {
      await ignoreKnowledgeGap(getSupabaseClient(), gap.id);
      if (editingGapId === gap.id) cancelEdit();
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not ignore the gap.', 'تعذر تجاهل فجوة المعرفة.'));
    }
  }

  async function reopenGap(gap: KnowledgeGap) {
    setError('');
    try {
      await reopenKnowledgeGap(getSupabaseClient(), gap.id);
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not reopen the gap.', 'تعذر إعادة فتح فجوة المعرفة.'));
    }
  }

  return <>
    <header className="page-header knowledge-gaps-header">
      <div className="knowledge-gaps-heading">
        <p className="eyebrow">{tr('Knowledge improvement', 'تحسين المعرفة')}</p>
        <h1>{tr('Knowledge gaps', 'فجوات المعرفة')}</h1>
        <p className="muted page-subtitle">{tr(
          'Answer unsupported questions here. Saved answers become trusted knowledge and are indexed by the existing knowledge pipeline.',
          'أجب هنا عن الأسئلة غير المدعومة. تتحول الإجابات المحفوظة إلى معرفة موثوقة وتتم فهرستها عبر مسار المعرفة الحالي.',
        )}</p>
      </div>
      <select className="compact-select knowledge-gaps-status-filter" value={status} onChange={(event) => setStatus(event.target.value)} aria-label={tr('Filter knowledge gaps by status', 'تصفية فجوات المعرفة حسب الحالة')}>
        <option value="OPEN">{tr('Open', 'مفتوح')}</option>
        <option value="RESOLVED">{tr('Resolved', 'تم الحل')}</option>
        <option value="IGNORED">{tr('Ignored', 'متجاهل')}</option>
        <option value="ALL">{tr('All', 'الكل')}</option>
      </select>
    </header>

    <section className="knowledge-answer-note panel" aria-label={tr('How admin answers work', 'كيف تعمل إجابات المشرف')}>
      <strong>{tr('Trusted answer workflow', 'مسار الإجابة الموثوقة')}</strong>
      <span>{tr('Save answer → trusted knowledge document → existing n8n indexing → available to RAG.', 'حفظ الإجابة ← مستند معرفة موثوق ← فهرسة n8n الحالية ← متاح للاسترجاع.')}</span>
    </section>

    {error && <p className="form-error" role="alert">{error}</p>}

    <section className="table-card mobile-card-table">
      <div className="table-scroll">
        <table className="responsive-table knowledge-gaps-table">
          <thead><tr><th>{tr('Question & trusted answer', 'السؤال والإجابة الموثوقة')}</th><th>{tr('Asked', 'عدد المرات')}</th><th>{tr('Platform', 'المنصة')}</th><th>{tr('Last seen', 'آخر ظهور')}</th><th>{tr('Status', 'الحالة')}</th><th /></tr></thead>
          <tbody>
            {items.map((gap) => {
              const editing = editingGapId === gap.id;
              const saving = savingGapId === gap.id;
              const canIgnore = gap.status === 'OPEN' && !gap.adminAnswer && !gap.resolvedDocumentId;
              return <tr key={gap.id}>
                <td data-label={tr('Question & trusted answer', 'السؤال والإجابة الموثوقة')} className="question-cell knowledge-answer-cell">
                  <strong>{gap.question}</strong>
                  <small className="table-subtext">{gap.language?.toUpperCase() || '—'}</small>
                  {gap.adminAnswer && !editing && <div className="trusted-answer-preview"><span>{tr('Trusted answer', 'الإجابة الموثوقة')}</span><p>{gap.adminAnswer}</p>{gap.answeredAt && <small>{tr('Saved', 'حُفظت')} {formatDate(gap.answeredAt)}</small>}</div>}
                  {editing && <div className="knowledge-answer-editor">
                    <label htmlFor={`knowledge-gap-answer-${gap.id}`}>{tr('Trusted answer', 'الإجابة الموثوقة')}</label>
                    <textarea
                      id={`knowledge-gap-answer-${gap.id}`}
                      aria-label={tr('Trusted answer', 'الإجابة الموثوقة')}
                      value={answerDraft}
                      onChange={(event) => setAnswerDraft(event.target.value)}
                      maxLength={20000}
                      rows={5}
                      autoFocus
                      placeholder={tr('Write the verified answer the assistant should use for questions like this…', 'اكتب الإجابة الموثقة التي يجب أن يستخدمها المساعد لأسئلة مشابهة…')}
                    />
                    <div className="knowledge-answer-editor-footer"><small>{answerDraft.trim().length.toLocaleString()} / 20,000</small><div className="decision-actions"><button className="compact-button" type="button" onClick={cancelEdit} disabled={saving}>{tr('Cancel', 'إلغاء')}</button><button className="compact-button primary-inline" type="button" onClick={() => void saveAnswer(gap)} disabled={saving || answerDraft.trim().length < 2}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save answer', 'حفظ الإجابة')}</button></div></div>
                  </div>}
                </td>
                <td data-label={tr('Asked', 'عدد المرات')}><strong>{gap.occurrenceCount}</strong></td>
                <td data-label={tr('Platform', 'المنصة')}>{gap.platform || '—'}</td>
                <td data-label={tr('Last seen', 'آخر ظهور')}>{formatDate(gap.lastSeenAt)}</td>
                <td data-label={tr('Status', 'الحالة')}><Status value={gap.status} /></td>
                <td data-label="" className="table-action"><div className="decision-actions knowledge-gap-actions">
                  {!editing && <button className="compact-button" type="button" onClick={() => beginEdit(gap)}>{gap.adminAnswer ? tr('Edit answer', 'تعديل الإجابة') : tr('Add answer', 'إضافة إجابة')}</button>}
                  {canIgnore && <button className="compact-button" type="button" onClick={() => void ignoreGap(gap)}>{tr('Ignore', 'تجاهل')}</button>}
                  {gap.status !== 'OPEN' && <button className="compact-button" type="button" onClick={() => void reopenGap(gap)}>{tr('Reopen', 'إعادة فتح')}</button>}
                </div></td>
              </tr>;
            })}
            {!loading && !items.length && <tr><td colSpan={6} className="empty-row">{tr('No knowledge gaps in this view.', 'لا توجد فجوات معرفة في هذا العرض.')}</td></tr>}
            {loading && <tr><td colSpan={6} className="empty-row">{tr('Loading gaps…', 'جارٍ تحميل الفجوات…')}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </>;
}
