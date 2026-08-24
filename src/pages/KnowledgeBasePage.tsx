import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  approveKnowledgeDocument,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  requestKnowledgeDocumentReprocessing,
} from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { KnowledgeDocumentSummary } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { ConfirmDialog, useToast } from '../components/Feedback';
import { KnowledgeDocumentEditor } from '../components/KnowledgeDocumentEditor';
import { useLanguage } from '../i18n/LanguageContext';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const statusClass = (status: string) => status === 'READY' ? 'healthy' : status === 'FAILED' ? 'danger' : 'neutral';
type ConfirmAction = { kind: 'delete'; id: string; title: string } | { kind: 'bulk-approve' } | { kind: 'bulk-reprocess' } | null;

export function KnowledgeBasePage() {
  const { tr, isArabic } = useLanguage();
  const { notify } = useToast();
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>();
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('PROJECT_OFFICIAL');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState<File | null>(null);

  const categoryLabel = (value: string) => ({
    PROJECT_OFFICIAL: tr('Official project document', 'مستند رسمي للمشروع'),
    TECHNICAL_REVIEW: tr('Technical review', 'مراجعة تقنية'),
    INTERNAL_QA: tr('Internal Q&A', 'أسئلة وأجوبة داخلية'),
    DEFENSIVE_PLAYBOOK: tr('Security playbook', 'دليل أمان'),
    ADVERSARIAL_TESTING: tr('Internal testing', 'اختبارات داخلية'),
  }[value] ?? value.replaceAll('_', ' '));

  useEffect(() => {
    setError(false);
    listKnowledgeDocuments(getSupabaseClient(), filter === 'ALL' ? undefined : filter)
      .then((result) => {
        setDocuments(result.items);
        setTotal(result.total);
        setSelectedIds((current) => current.filter((id) => result.items.some((item) => item.id === id)));
      })
      .catch(() => setError(true));
  }, [filter, reload]);

  const readyCount = useMemo(() => documents?.filter((item) => item.processingStatus === 'READY').length ?? 0, [documents]);
  const approvedCount = useMemo(() => documents?.filter((item) => item.isApproved).length ?? 0, [documents]);
  const selectedDocuments = useMemo(() => documents?.filter((item) => selectedIds.includes(item.id)) ?? [], [documents, selectedIds]);
  const approvableSelected = selectedDocuments.filter((item) => item.processingStatus === 'READY' && !item.isApproved);
  const allVisibleSelected = Boolean(documents?.length && documents.every((item) => selectedIds.includes(item.id)));

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim() || uploading) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      const text = tr('File is too large. The maximum upload size is 20 MB.', 'الملف كبير جداً. الحد الأقصى للرفع هو 20 ميغابايت.');
      setMessage(text);
      notify({ tone: 'error', title: tr('Upload blocked', 'تم منع الرفع'), message: text });
      return;
    }
    setUploading(true); setMessage('');
    try {
      await createKnowledgeDocument(getSupabaseClient(), { title, category, language, file });
      const text = tr(`Uploaded ${file.name}. The document is waiting for processing.`, `تم رفع ${file.name}. المستند بانتظار المعالجة.`);
      setMessage(text);
      notify({ tone: 'success', title: tr('Document uploaded', 'تم رفع المستند'), message: text });
      setTitle(''); setFile(null); setReload((n) => n + 1);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : tr('Upload failed.', 'فشل الرفع.');
      setMessage(text);
      notify({ tone: 'error', title: tr('Upload failed', 'فشل الرفع'), message: text });
    } finally { setUploading(false); }
  }

  async function act(id: string, action: 'approve' | 'reprocess' | 'delete') {
    if (busyId || bulkBusy) return;
    setBusyId(id); setMessage('');
    try {
      if (action === 'approve') await approveKnowledgeDocument(getSupabaseClient(), id);
      if (action === 'reprocess') await requestKnowledgeDocumentReprocessing(getSupabaseClient(), id);
      if (action === 'delete') await deleteKnowledgeDocument(getSupabaseClient(), id);
      const text = action === 'approve' ? tr('Document approved.', 'تم اعتماد المستند.') : action === 'reprocess' ? tr('Document queued for reprocessing.', 'تمت جدولة المستند لإعادة المعالجة.') : tr('Document deleted.', 'تم حذف المستند.');
      setMessage(text);
      notify({ tone: 'success', title: text });
      if (action === 'delete') setSelectedIds((current) => current.filter((item) => item !== id));
      setReload((n) => n + 1);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : tr('Action failed.', 'فشل الإجراء.');
      setMessage(text);
      notify({ tone: 'error', title: tr('Action failed', 'فشل الإجراء'), message: text });
    } finally { setBusyId(null); }
  }

  async function runBulk(action: 'approve' | 'reprocess') {
    const targets = action === 'approve' ? approvableSelected : selectedDocuments;
    if (!targets.length || bulkBusy) return;
    setBulkBusy(true);
    let succeeded = 0;
    try {
      for (const doc of targets) {
        if (action === 'approve') await approveKnowledgeDocument(getSupabaseClient(), doc.id);
        else await requestKnowledgeDocumentReprocessing(getSupabaseClient(), doc.id);
        succeeded += 1;
      }
      notify({
        tone: 'success',
        title: action === 'approve' ? tr('Documents approved', 'تم اعتماد المستندات') : tr('Reprocessing queued', 'تمت جدولة إعادة المعالجة'),
        message: tr(`${succeeded} documents updated successfully.`, `تم تحديث ${succeeded} مستندات بنجاح.`),
      });
      setSelectedIds([]);
      setReload((n) => n + 1);
    } catch (caught) {
      notify({ tone: 'error', title: tr('Bulk action stopped', 'توقف الإجراء الجماعي'), message: caught instanceof Error ? caught.message : tr('One of the selected documents could not be updated.', 'تعذر تحديث أحد المستندات المحددة.') });
      setReload((n) => n + 1);
    } finally {
      setBulkBusy(false);
      setConfirmAction(null);
    }
  }

  function toggleDocument(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    if (!documents?.length) return;
    if (allVisibleSelected) setSelectedIds([]);
    else setSelectedIds(documents.map((item) => item.id));
  }

  const statusLabel = (status: string) => ({ PENDING: tr('Pending', 'قيد الانتظار'), PROCESSING: tr('Processing', 'قيد المعالجة'), READY: tr('Ready', 'جاهز'), FAILED: tr('Failed', 'فشل') }[status] ?? status);

  const confirmTitle = confirmAction?.kind === 'delete'
    ? tr('Delete knowledge document?', 'حذف مستند قاعدة المعرفة؟')
    : confirmAction?.kind === 'bulk-approve'
      ? tr('Approve selected documents?', 'اعتماد المستندات المحددة؟')
      : tr('Reprocess selected documents?', 'إعادة معالجة المستندات المحددة؟');

  const confirmMessage = confirmAction?.kind === 'delete'
    ? tr(`“${confirmAction.title}” will be removed from the knowledge library.`, `سيتم حذف “${confirmAction.title}” من مكتبة المعرفة.`)
    : confirmAction?.kind === 'bulk-approve'
      ? tr(`${approvableSelected.length} ready documents will become available to the assistant after approval.`, `سيصبح ${approvableSelected.length} مستنداً جاهزاً متاحاً للمساعد بعد الاعتماد.`)
      : tr(`${selectedDocuments.length} selected documents will be queued for processing again.`, `ستتم جدولة ${selectedDocuments.length} مستندات محددة لإعادة المعالجة.`);

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{tr('Project knowledge', 'معرفة المشروع')}</p><h1>{tr('Knowledge base', 'قاعدة المعرفة')}</h1><p className="muted page-subtitle">{tr('Upload, review, edit and approve the sources the assistant is allowed to use.', 'ارفع المصادر وراجعها وعدّلها واعتمد ما يُسمح للمساعد باستخدامه.')}</p></div><span className="status-pill neutral">{total} {tr('documents', 'مستندات')}</span></header>

      <section className="metric-grid compact-metrics"><article className="metric-card"><span>{tr('Processed', 'تمت المعالجة')}</span><strong>{readyCount}</strong><small>{tr('Ready for approval or use', 'جاهز للاعتماد أو الاستخدام')}</small></article><article className="metric-card"><span>{tr('Approved', 'معتمد')}</span><strong>{approvedCount}</strong><small>{tr('Available to the assistant', 'متاح للمساعد')}</small></article></section>

      <section className="knowledge-layout">
        <form className="panel upload-panel" onSubmit={uploadDocument}>
          <p className="eyebrow">{tr('Add source', 'إضافة مصدر')}</p><h2>{tr('Upload document', 'رفع مستند')}</h2>
          <label>{tr('Title', 'العنوان')}<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder={tr('Alexandria White Paper', 'الورقة البيضاء لمشروع Alexandria')} /></label>
          <label>{tr('Document type', 'نوع المستند')}<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="PROJECT_OFFICIAL">{tr('Official project document', 'مستند رسمي للمشروع')}</option><option value="TECHNICAL_REVIEW">{tr('Technical review', 'مراجعة تقنية')}</option><option value="INTERNAL_QA">{tr('Internal Q&A', 'أسئلة وأجوبة داخلية')}</option><option value="DEFENSIVE_PLAYBOOK">{tr('Security playbook', 'دليل أمان')}</option><option value="ADVERSARIAL_TESTING">{tr('Internal testing', 'اختبارات داخلية')}</option></select></label>
          <label>{tr('Language', 'لغة المستند')}<input value={language} onChange={(event) => setLanguage(event.target.value)} required placeholder="en" maxLength={8} dir="ltr" /></label>
          <label>{tr('File', 'الملف')}<input type="file" accept=".docx,.txt,.md" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><small className="helper">{tr('Supported: DOCX, TXT and Markdown · maximum 20 MB', 'المدعوم: DOCX وTXT وMarkdown · الحد الأقصى 20 ميغابايت')}</small></label>
          <button className="primary" disabled={uploading || !file || !title.trim()}>{uploading ? tr('Uploading…', 'جارٍ الرفع…') : tr('Upload document', 'رفع المستند')}</button>
          <p className="muted form-note">{tr('New or edited documents are processed first and must be approved before the assistant can use them.', 'تتم معالجة المستندات الجديدة أو المعدلة أولاً ويجب اعتمادها قبل أن يتمكن المساعد من استخدامها.')}</p>
          {message && <p className="form-success" role="status">{message}</p>}
        </form>

        <div className="knowledge-main">
          <div className="toolbar-row"><div><p className="eyebrow">{tr('Documents', 'المستندات')}</p><h2>{tr('Source library', 'مكتبة المصادر')}</h2></div><div className="table-tools"><button type="button" className="compact-button" disabled={!documents?.length} onClick={toggleAllVisible}>{allVisibleSelected ? tr('Clear all', 'مسح الكل') : tr('Select all', 'تحديد الكل')}</button><select className="compact-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">{tr('All statuses', 'كل الحالات')}</option><option value="PENDING">{tr('Pending', 'قيد الانتظار')}</option><option value="PROCESSING">{tr('Processing', 'قيد المعالجة')}</option><option value="READY">{tr('Ready', 'جاهز')}</option><option value="FAILED">{tr('Failed', 'فشل')}</option></select></div></div>

          {selectedIds.length > 0 && (
            <div className="bulk-toolbar" role="status">
              <div className="bulk-toolbar-copy"><span className="bulk-count">{selectedIds.length}</span><span>{tr('documents selected', 'مستندات محددة')}</span></div>
              <div className="bulk-actions"><button type="button" disabled={!approvableSelected.length || bulkBusy} onClick={() => setConfirmAction({ kind: 'bulk-approve' })}>{tr(`Approve ready (${approvableSelected.length})`, `اعتماد الجاهز (${approvableSelected.length})`)}</button><button type="button" disabled={bulkBusy} onClick={() => setConfirmAction({ kind: 'bulk-reprocess' })}>{tr('Reprocess selected', 'إعادة معالجة المحدد')}</button><button type="button" disabled={bulkBusy} onClick={() => setSelectedIds([])}>{tr('Clear selection', 'مسح التحديد')}</button></div>
            </div>
          )}

          {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !documents ? <LoadingState label={tr('Loading knowledge documents', 'جارٍ تحميل مستندات قاعدة المعرفة')} /> : documents.length === 0 ? <div className="panel empty-state"><h3>{tr('No documents found', 'لم يتم العثور على مستندات')}</h3><p className="muted">{tr('Upload a source or choose another status filter.', 'ارفع مصدراً أو اختر حالة مختلفة للتصفية.')}</p></div> : <div className="document-list">{documents.map((doc) => (
            <article className={`panel document-card ${selectedIds.includes(doc.id) ? 'selected-document' : ''}`} key={doc.id}>
              <label className="document-select"><input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleDocument(doc.id)} /> {tr('Select document', 'تحديد المستند')}</label>
              <div className="document-head"><div><div className="chip-row"><span className={`status-pill ${statusClass(doc.processingStatus)}`}>{statusLabel(doc.processingStatus)}</span>{doc.isApproved && <span className="status-pill healthy">{tr('Approved', 'معتمد')}</span>}</div><h3>{doc.title}</h3><p className="muted">{categoryLabel(doc.category)} · <span dir="ltr">{doc.language.toUpperCase()} · v{doc.version}</span></p></div><strong className="chunk-count">{doc.chunkCount > 0 ? '✓' : '—'}<small>{doc.chunkCount > 0 ? tr('Indexed', 'مفهرس') : tr('Not indexed', 'غير مفهرس')}</small></strong></div>
              {doc.processingError && <p className="form-error">{doc.processingError}</p>}
              <div className="document-footer"><small>{tr('Updated', 'آخر تحديث')} {new Date(doc.updatedAt).toLocaleString(isArabic ? 'ar-LB' : undefined)}</small><div className="decision-actions"><button type="button" className="compact-button" disabled={busyId === doc.id || bulkBusy || doc.processingStatus === 'PROCESSING'} onClick={() => setEditingId(doc.id)}>{tr('Open / Edit', 'فتح / تعديل')}</button><button type="button" className="compact-button" disabled={busyId === doc.id || bulkBusy || doc.processingStatus !== 'READY' || doc.isApproved} onClick={() => void act(doc.id, 'approve')}>{tr('Approve', 'اعتماد')}</button><button type="button" className="compact-button" disabled={busyId === doc.id || bulkBusy} onClick={() => void act(doc.id, 'reprocess')}>{tr('Reprocess', 'إعادة المعالجة')}</button><button type="button" className="compact-button danger" disabled={busyId === doc.id || bulkBusy} onClick={() => setConfirmAction({ kind: 'delete', id: doc.id, title: doc.title })}>{tr('Delete', 'حذف')}</button></div></div>
            </article>
          ))}</div>}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmTitle}
        message={<p>{confirmMessage}</p>}
        confirmLabel={bulkBusy ? tr('Working…', 'جارٍ التنفيذ…') : confirmAction?.kind === 'delete' ? tr('Delete document', 'حذف المستند') : confirmAction?.kind === 'bulk-approve' ? tr('Approve selected', 'اعتماد المحدد') : tr('Reprocess selected', 'إعادة معالجة المحدد')}
        cancelLabel={tr('Cancel', 'إلغاء')}
        tone={confirmAction?.kind === 'delete' ? 'danger' : 'primary'}
        busy={bulkBusy || Boolean(busyId)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.kind === 'delete') { const { id } = confirmAction; setConfirmAction(null); void act(id, 'delete'); }
          if (confirmAction?.kind === 'bulk-approve') void runBulk('approve');
          if (confirmAction?.kind === 'bulk-reprocess') void runBulk('reprocess');
        }}
      />

      {editingId && <KnowledgeDocumentEditor documentId={editingId} onClose={() => setEditingId(null)} onSaved={() => setReload((n) => n + 1)} />}
    </>
  );
}
