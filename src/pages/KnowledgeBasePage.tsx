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
    setUploading(true); setMessage('');
    try {
      const created = await createKnowledgeDocument(getSupabaseClient(), { title, category, language, file });
      setMessage(tr(`Uploaded ${file.name}. Document ${created.id} is now waiting for server-side processing.`, `تم رفع ${file.name}. المستند ${created.id} بانتظار المعالجة على الخادم.`));
      setTitle(''); setFile(null); setReload((n) => n + 1);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr('Upload failed.', 'فشل الرفع.'));
    } finally { setUploading(false); }
  }

  async function act(id: string, action: 'approve' | 'reprocess' | 'delete') {
    if (busyId) return;
    if (action === 'delete' && !window.confirm(tr('Delete this knowledge document and its chunks?', 'هل تريد حذف مستند قاعدة المعرفة هذا وجميع أجزائه؟'))) return;
    setBusyId(id); setMessage('');
    try {
      if (action === 'approve') await approveKnowledgeDocument(getSupabaseClient(), id);
      if (action === 'reprocess') await requestKnowledgeDocumentReprocessing(getSupabaseClient(), id);
      if (action === 'delete') await deleteKnowledgeDocument(getSupabaseClient(), id);
      setMessage(action === 'approve' ? tr('Document approved.', 'تم اعتماد المستند.') : action === 'reprocess' ? tr('Document reset for reprocessing.', 'تمت إعادة المستند للمعالجة.') : tr('Document deleted.', 'تم حذف المستند.'));
      setReload((n) => n + 1);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr('Action failed.', 'فشل الإجراء.'));
    } finally { setBusyId(null); }
  }

  const statusLabel = (status: string) => ({
    PENDING: tr('Pending', 'قيد الانتظار'),
    PROCESSING: tr('Processing', 'قيد المعالجة'),
    READY: tr('Ready', 'جاهز'),
    FAILED: tr('Failed', 'فشل'),
  }[status] ?? status);

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">{tr('RAG sources', 'مصادر RAG')}</p><h1>{tr('Knowledge base', 'قاعدة المعرفة')}</h1><p className="muted page-subtitle">{tr('Upload approved project sources, open them like documents, edit the extracted knowledge, and control what can feed retrieval.', 'ارفع مصادر المشروع، افتحها كمستندات، عدّل محتوى المعرفة المستخرج، وتحكم بالمستندات المسموح باستخدامها في الاسترجاع.')}</p></div>
        <span className="status-pill neutral">{total} {tr('documents', 'مستندات')}</span>
      </header>

      <section className="metric-grid compact-metrics">
        <article className="metric-card"><span>{tr('Ready', 'جاهز')}</span><strong>{readyCount}</strong><small>{tr('Embedding pipeline completed', 'اكتملت عملية التضمين')}</small></article>
        <article className="metric-card"><span>{tr('Approved', 'معتمد')}</span><strong>{approvedCount}</strong><small>{tr('Eligible for project retrieval', 'مسموح باستخدامه في استرجاع معلومات المشروع')}</small></article>
      </section>

      <section className="knowledge-layout">
        <form className="panel upload-panel" onSubmit={uploadDocument}>
          <p className="eyebrow">{tr('Add source', 'إضافة مصدر')}</p><h2>{tr('Upload document', 'رفع مستند')}</h2>
          <label>{tr('Title', 'العنوان')}<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder={tr('Alexandria White Paper', 'الورقة البيضاء لمشروع Alexandria')} /></label>
          <label>{tr('Category', 'الفئة')}<select value={category} onChange={(event) => setCategory(event.target.value)} dir="ltr"><option>PROJECT_OFFICIAL</option><option>TECHNICAL_REVIEW</option><option>INTERNAL_QA</option><option>DEFENSIVE_PLAYBOOK</option><option>ADVERSARIAL_TESTING</option></select></label>
          <label>{tr('Language', 'لغة المستند')}<input value={language} onChange={(event) => setLanguage(event.target.value)} required placeholder="en" maxLength={8} dir="ltr" /></label>
          <label>{tr('File', 'الملف')}<input type="file" accept=".pdf,.doc,.docx,.txt,.md" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <button className="primary" disabled={uploading || !file || !title.trim()}>{uploading ? tr('Uploading…', 'جارٍ الرفع…') : tr('Upload to Supabase', 'رفع إلى Supabase')}</button>
          <p className="muted form-note">{tr('The original file stays in the protected knowledge-base bucket. After processing, admins can open and edit the extracted knowledge in the built-in document editor.', 'يبقى الملف الأصلي في مساحة knowledge-base المحمية. بعد المعالجة، يستطيع المشرف فتح المعرفة المستخرجة وتعديلها في محرر المستندات المدمج.')}</p>
          {message && <p className="form-success" role="status">{message}</p>}
        </form>

        <div className="knowledge-main">
          <div className="toolbar-row"><div><p className="eyebrow">{tr('Documents', 'المستندات')}</p><h2>{tr('Source library', 'مكتبة المصادر')}</h2></div><select className="compact-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">{tr('All statuses', 'كل الحالات')}</option><option value="PENDING">{tr('Pending', 'قيد الانتظار')}</option><option value="PROCESSING">{tr('Processing', 'قيد المعالجة')}</option><option value="READY">{tr('Ready', 'جاهز')}</option><option value="FAILED">{tr('Failed', 'فشل')}</option></select></div>

          {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !documents ? <LoadingState label={tr('Loading knowledge documents', 'جارٍ تحميل مستندات قاعدة المعرفة')} /> : documents.length === 0 ? (
            <div className="panel empty-state"><h3>{tr('No documents found', 'لم يتم العثور على مستندات')}</h3><p className="muted">{tr('Upload a source or choose another status filter.', 'ارفع مصدراً أو اختر حالة مختلفة للتصفية.')}</p></div>
          ) : (
            <div className="document-list">{documents.map((doc) => (
              <article className="panel document-card" key={doc.id}>
                <div className="document-head"><div><div className="chip-row"><span className={`status-pill ${statusClass(doc.processingStatus)}`}>{statusLabel(doc.processingStatus)}</span>{doc.isApproved && <span className="status-pill healthy">{tr('Approved', 'معتمد')}</span>}</div><h3>{doc.title}</h3><p className="muted" dir="ltr">{doc.category} · {doc.language.toUpperCase()} · v{doc.version}</p></div><strong className="chunk-count">{doc.chunkCount}<small>{tr('chunks', 'أجزاء')}</small></strong></div>
                {doc.processingError && <p className="form-error" dir="ltr">{doc.processingError}</p>}
                <div className="document-footer"><small>{tr('Updated', 'آخر تحديث')} {new Date(doc.updatedAt).toLocaleString(isArabic ? 'ar-LB' : undefined)}</small><div className="decision-actions">
                  <button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus === 'PROCESSING'} onClick={() => setEditingId(doc.id)}>{tr('Open / Edit', 'فتح / تعديل')}</button>
                  <button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus !== 'READY' || doc.isApproved} onClick={() => act(doc.id, 'approve')}>{tr('Approve', 'اعتماد')}</button>
                  <button type="button" className="compact-button" disabled={busyId === doc.id} onClick={() => act(doc.id, 'reprocess')}>{tr('Reprocess', 'إعادة المعالجة')}</button>
                  <button type="button" className="compact-button danger" disabled={busyId === doc.id} onClick={() => act(doc.id, 'delete')}>{tr('Delete', 'حذف')}</button>
                </div></div>
              </article>
            ))}</div>
          )}
        </div>
      </section>

      {editingId && (
        <KnowledgeDocumentEditor
          documentId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => setReload((n) => n + 1)}
        />
      )}
    </>
  );
}
