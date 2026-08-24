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
import { KnowledgeDocumentEditor } from '../components/KnowledgeDocumentEditor';
import { useLanguage } from '../i18n/LanguageContext';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const statusClass = (status: string) => status === 'READY' ? 'healthy' : status === 'FAILED' ? 'danger' : 'neutral';

export function KnowledgeBasePage() {
  const { tr, isArabic } = useLanguage();
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>();
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      .then((result) => { setDocuments(result.items); setTotal(result.total); })
      .catch(() => setError(true));
  }, [filter, reload]);

  const readyCount = useMemo(() => documents?.filter((item) => item.processingStatus === 'READY').length ?? 0, [documents]);
  const approvedCount = useMemo(() => documents?.filter((item) => item.isApproved).length ?? 0, [documents]);

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim() || uploading) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setMessage(tr('File is too large. The maximum upload size is 20 MB.', 'الملف كبير جداً. الحد الأقصى للرفع هو 20 ميغابايت.'));
      return;
    }
    setUploading(true); setMessage('');
    try {
      const created = await createKnowledgeDocument(getSupabaseClient(), { title, category, language, file });
      setMessage(tr(`Uploaded ${file.name}. The document is waiting for processing.`, `تم رفع ${file.name}. المستند بانتظار المعالجة.`));
      setTitle(''); setFile(null); setReload((n) => n + 1);
      void created;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr('Upload failed.', 'فشل الرفع.'));
    } finally { setUploading(false); }
  }

  async function act(id: string, action: 'approve' | 'reprocess' | 'delete') {
    if (busyId) return;
    if (action === 'delete' && !window.confirm(tr('Delete this knowledge document?', 'هل تريد حذف مستند قاعدة المعرفة هذا؟'))) return;
    setBusyId(id); setMessage('');
    try {
      if (action === 'approve') await approveKnowledgeDocument(getSupabaseClient(), id);
      if (action === 'reprocess') await requestKnowledgeDocumentReprocessing(getSupabaseClient(), id);
      if (action === 'delete') await deleteKnowledgeDocument(getSupabaseClient(), id);
      setMessage(action === 'approve' ? tr('Document approved.', 'تم اعتماد المستند.') : action === 'reprocess' ? tr('Document queued for reprocessing.', 'تمت جدولة المستند لإعادة المعالجة.') : tr('Document deleted.', 'تم حذف المستند.'));
      setReload((n) => n + 1);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr('Action failed.', 'فشل الإجراء.'));
    } finally { setBusyId(null); }
  }

  const statusLabel = (status: string) => ({ PENDING: tr('Pending', 'قيد الانتظار'), PROCESSING: tr('Processing', 'قيد المعالجة'), READY: tr('Ready', 'جاهز'), FAILED: tr('Failed', 'فشل') }[status] ?? status);

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
          <div className="toolbar-row"><div><p className="eyebrow">{tr('Documents', 'المستندات')}</p><h2>{tr('Source library', 'مكتبة المصادر')}</h2></div><select className="compact-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">{tr('All statuses', 'كل الحالات')}</option><option value="PENDING">{tr('Pending', 'قيد الانتظار')}</option><option value="PROCESSING">{tr('Processing', 'قيد المعالجة')}</option><option value="READY">{tr('Ready', 'جاهز')}</option><option value="FAILED">{tr('Failed', 'فشل')}</option></select></div>
          {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !documents ? <LoadingState label={tr('Loading knowledge documents', 'جارٍ تحميل مستندات قاعدة المعرفة')} /> : documents.length === 0 ? <div className="panel empty-state"><h3>{tr('No documents found', 'لم يتم العثور على مستندات')}</h3><p className="muted">{tr('Upload a source or choose another status filter.', 'ارفع مصدراً أو اختر حالة مختلفة للتصفية.')}</p></div> : <div className="document-list">{documents.map((doc) => (
            <article className="panel document-card" key={doc.id}>
              <div className="document-head"><div><div className="chip-row"><span className={`status-pill ${statusClass(doc.processingStatus)}`}>{statusLabel(doc.processingStatus)}</span>{doc.isApproved && <span className="status-pill healthy">{tr('Approved', 'معتمد')}</span>}</div><h3>{doc.title}</h3><p className="muted">{categoryLabel(doc.category)} · <span dir="ltr">{doc.language.toUpperCase()} · v{doc.version}</span></p></div><strong className="chunk-count">{doc.chunkCount > 0 ? '✓' : '—'}<small>{doc.chunkCount > 0 ? tr('Indexed', 'مفهرس') : tr('Not indexed', 'غير مفهرس')}</small></strong></div>
              {doc.processingError && <p className="form-error">{doc.processingError}</p>}
              <div className="document-footer"><small>{tr('Updated', 'آخر تحديث')} {new Date(doc.updatedAt).toLocaleString(isArabic ? 'ar-LB' : undefined)}</small><div className="decision-actions"><button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus === 'PROCESSING'} onClick={() => setEditingId(doc.id)}>{tr('Open / Edit', 'فتح / تعديل')}</button><button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus !== 'READY' || doc.isApproved} onClick={() => act(doc.id, 'approve')}>{tr('Approve', 'اعتماد')}</button><button type="button" className="compact-button" disabled={busyId === doc.id} onClick={() => act(doc.id, 'reprocess')}>{tr('Reprocess', 'إعادة المعالجة')}</button><button type="button" className="compact-button danger" disabled={busyId === doc.id} onClick={() => act(doc.id, 'delete')}>{tr('Delete', 'حذف')}</button></div></div>
            </article>
          ))}</div>}
        </div>
      </section>
      {editingId && <KnowledgeDocumentEditor documentId={editingId} onClose={() => setEditingId(null)} onSaved={() => setReload((n) => n + 1)} />}
    </>
  );
}
