import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  approveKnowledgeDocument,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  requestKnowledgeDocumentReprocessing,
} from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { KnowledgeDocumentSummary } from '../types/contracts';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { ConfirmDialog, useToast } from '../components/Feedback';
import { KnowledgeDocumentEditor } from '../components/KnowledgeDocumentEditor';
import { useLanguage } from '../i18n/LanguageContext';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['docx', 'txt', 'md'];
const statusClass = (status: string) => status === 'READY' ? 'healthy' : status === 'FAILED' ? 'danger' : 'neutral';
type ConfirmAction = { kind: 'delete'; id: string; title: string } | { kind: 'bulk-approve' } | { kind: 'bulk-reprocess' } | null;
type LibraryFilter = 'ALL' | 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'APPROVED' | 'AVAILABLE';
type UploadStage = 'idle' | 'uploading' | 'queued' | 'error';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(file: File) {
  return file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
}

function isAvailable(doc: KnowledgeDocumentSummary) {
  return doc.processingStatus === 'READY' && doc.isApproved && doc.chunkCount > 0;
}

function processingStep(status: string) {
  if (status === 'READY') return 3;
  if (status === 'PROCESSING') return 2;
  if (status === 'FAILED') return 2;
  return 1;
}

export function KnowledgeBasePage() {
  const { tr, isArabic } = useLanguage();
  const { notify } = useToast();
  const [allDocuments, setAllDocuments] = useState<KnowledgeDocumentSummary[]>();
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<LibraryFilter>('ALL');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('idle');
  const [lastUploadedName, setLastUploadedName] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('PROJECT_OFFICIAL');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadPanelRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const categoryLabel = (value: string) => ({
    PROJECT_OFFICIAL: tr('Official project document', 'مستند رسمي للمشروع'),
    TECHNICAL_REVIEW: tr('Technical review', 'مراجعة تقنية'),
    INTERNAL_QA: tr('Internal Q&A', 'أسئلة وأجوبة داخلية'),
    DEFENSIVE_PLAYBOOK: tr('Security playbook', 'دليل أمان'),
    ADVERSARIAL_TESTING: tr('Internal testing', 'اختبارات داخلية'),
  }[value] ?? value.replaceAll('_', ' '));

  useEffect(() => {
    setError(false);
    listKnowledgeDocuments(getSupabaseClient())
      .then((result) => {
        setAllDocuments(result.items);
        setTotal(result.total);
        setSelectedIds((current) => current.filter((id) => result.items.some((item) => item.id === id)));
      })
      .catch(() => setError(true));
  }, [reload]);

  const processingCount = useMemo(() => allDocuments?.filter((item) => ['PENDING', 'PROCESSING'].includes(item.processingStatus)).length ?? 0, [allDocuments]);

  useEffect(() => {
    if (!processingCount) return undefined;
    const timer = window.setInterval(() => setReload((value) => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [processingCount]);

  const documents = useMemo(() => {
    if (!allDocuments) return undefined;
    if (filter === 'ALL') return allDocuments;
    if (filter === 'APPROVED') return allDocuments.filter((item) => item.isApproved);
    if (filter === 'AVAILABLE') return allDocuments.filter(isAvailable);
    return allDocuments.filter((item) => item.processingStatus === filter);
  }, [allDocuments, filter]);

  const readyCount = useMemo(() => allDocuments?.filter((item) => item.processingStatus === 'READY').length ?? 0, [allDocuments]);
  const approvedCount = useMemo(() => allDocuments?.filter((item) => item.isApproved).length ?? 0, [allDocuments]);
  const availableCount = useMemo(() => allDocuments?.filter(isAvailable).length ?? 0, [allDocuments]);
  const selectedDocuments = useMemo(() => allDocuments?.filter((item) => selectedIds.includes(item.id)) ?? [], [allDocuments, selectedIds]);
  const approvableSelected = selectedDocuments.filter((item) => item.processingStatus === 'READY' && !item.isApproved);
  const allVisibleSelected = Boolean(documents?.length && documents.every((item) => selectedIds.includes(item.id)));

  function chooseFile(nextFile: File | null) {
    setMessage('');
    setMessageIsError(false);
    setLastUploadedName('');
    setUploadStage('idle');
    if (!nextFile) {
      setFile(null);
      return;
    }

    const extension = extensionOf(nextFile);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      const text = tr('Unsupported file type. Choose DOCX, TXT or Markdown.', 'نوع الملف غير مدعوم. اختر DOCX أو TXT أو Markdown.');
      setFile(null);
      setMessage(text);
      setMessageIsError(true);
      notify({ tone: 'error', title: tr('File not supported', 'الملف غير مدعوم'), message: text });
      return;
    }
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      const text = tr('File is too large. The maximum upload size is 20 MB.', 'الملف كبير جداً. الحد الأقصى للرفع هو 20 ميغابايت.');
      setFile(null);
      setMessage(text);
      setMessageIsError(true);
      notify({ tone: 'error', title: tr('Upload blocked', 'تم منع الرفع'), message: text });
      return;
    }

    setFile(nextFile);
    if (!title.trim()) setTitle(nextFile.name.replace(/\.[^.]+$/, ''));
  }

  function dropFile(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragActive(false);
    chooseFile(event.dataTransfer.files?.[0] ?? null);
  }

  function focusUpload() {
    uploadPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => titleRef.current?.focus(), 350);
  }

  async function uploadDocument(event: FormEvent) {
    event.preventDefault();
    if (!file || !title.trim() || uploading) return;
    setUploading(true);
    setUploadStage('uploading');
    setMessage('');
    setMessageIsError(false);
    try {
      const uploadingName = file.name;
      await createKnowledgeDocument(getSupabaseClient(), { title, category, language, file });
      const text = tr(`Uploaded ${uploadingName}. Processing has been queued.`, `تم رفع ${uploadingName}. تمت جدولة المعالجة.`);
      setMessage(text);
      setMessageIsError(false);
      setLastUploadedName(uploadingName);
      setUploadStage('queued');
      notify({ tone: 'success', title: tr('Document uploaded', 'تم رفع المستند'), message: text });
      setTitle('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setReload((n) => n + 1);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : tr('Upload failed.', 'فشل الرفع.');
      setMessage(text);
      setMessageIsError(true);
      setUploadStage('error');
      notify({ tone: 'error', title: tr('Upload failed', 'فشل الرفع'), message: text });
    } finally { setUploading(false); }
  }

  async function act(id: string, action: 'approve' | 'reprocess' | 'delete') {
    if (busyId || bulkBusy) return;
    setBusyId(id); setMessage(''); setMessageIsError(false);
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
      setMessageIsError(true);
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
    if (allVisibleSelected) setSelectedIds((current) => current.filter((id) => !documents.some((item) => item.id === id)));
    else setSelectedIds((current) => Array.from(new Set([...current, ...documents.map((item) => item.id)])));
  }

  const statusLabel = (status: string) => ({ PENDING: tr('Queued', 'في قائمة الانتظار'), PROCESSING: tr('Processing', 'قيد المعالجة'), READY: tr('Processed', 'تمت المعالجة'), FAILED: tr('Failed', 'فشل') }[status] ?? status);

  const confirmTitle = confirmAction?.kind === 'delete'
    ? tr('Delete knowledge document?', 'حذف مستند قاعدة المعرفة؟')
    : confirmAction?.kind === 'bulk-approve'
      ? tr('Approve selected documents?', 'اعتماد المستندات المحددة؟')
      : tr('Reprocess selected documents?', 'إعادة معالجة المستندات المحددة؟');

  const confirmMessage = confirmAction?.kind === 'delete'
    ? tr(`“${confirmAction.title}” will be removed from the knowledge library.`, `سيتم حذف “${confirmAction.title}” من مكتبة المعرفة.`)
    : confirmAction?.kind === 'bulk-approve'
      ? tr(`${approvableSelected.length} processed documents will be approved.`, `سيتم اعتماد ${approvableSelected.length} مستنداً تمت معالجته.`)
      : tr(`${selectedDocuments.length} selected documents will be queued for processing again.`, `ستتم جدولة ${selectedDocuments.length} مستندات محددة لإعادة المعالجة.`);

  const emptyCopy = filter === 'APPROVED'
    ? { title: tr('No approved documents yet', 'لا توجد مستندات معتمدة بعد'), message: tr('Upload a source, wait for processing, then approve it before the assistant can use it.', 'ارفع مصدراً وانتظر اكتمال المعالجة ثم اعتمده قبل أن يتمكن المساعد من استخدامه.') }
    : filter === 'AVAILABLE'
      ? { title: tr('Nothing is available to the assistant yet', 'لا يوجد شيء متاح للمساعد بعد'), message: tr('A document must be processed, approved, and indexed before it becomes available.', 'يجب معالجة المستند واعتماده وفهرسته قبل أن يصبح متاحاً.') }
      : filter === 'READY'
        ? { title: tr('No processed documents yet', 'لا توجد مستندات تمت معالجتها بعد'), message: tr('Upload a source and processing will start automatically.', 'ارفع مصدراً وستبدأ المعالجة تلقائياً.') }
        : filter === 'FAILED'
          ? { title: tr('No failed documents', 'لا توجد مستندات فاشلة'), message: tr('There are currently no processing failures to resolve.', 'لا توجد حالياً حالات فشل في المعالجة تحتاج إلى معالجة.') }
          : { title: tr('No documents found', 'لم يتم العثور على مستندات'), message: tr('Upload your first verified source to start building the assistant knowledge base.', 'ارفع أول مصدر موثوق لبدء بناء قاعدة معرفة المساعد.') };

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{tr('Project knowledge', 'معرفة المشروع')}</p><h1>{tr('Knowledge base', 'قاعدة المعرفة')}</h1><p className="muted page-subtitle">{tr('Upload, process and approve verified sources before they become available to the assistant.', 'ارفع المصادر الموثوقة وعالجها واعتمدها قبل أن تصبح متاحة للمساعد.')}</p></div><span className="status-pill neutral">{total} {tr('documents', 'مستندات')}</span></header>

      <section className="knowledge-state-grid" aria-label={tr('Knowledge publishing stages', 'مراحل نشر المعرفة')}>
        <article className="metric-card knowledge-stage-card"><span>{tr('Processed', 'تمت المعالجة')}</span><strong>{readyCount}</strong><small>{tr('Text extracted and indexing finished', 'اكتمل استخراج النص والفهرسة')}</small></article>
        <article className="metric-card knowledge-stage-card"><span>{tr('Approved', 'معتمد')}</span><strong>{approvedCount}</strong><small>{tr('Human approval has been recorded', 'تم تسجيل اعتماد المسؤول')}</small></article>
        <article className="metric-card knowledge-stage-card available-stage"><span>{tr('Available to assistant', 'متاح للمساعد')}</span><strong>{availableCount}</strong><small>{tr('Processed + approved + indexed', 'معالج + معتمد + مفهرس')}</small></article>
        <article className="metric-card knowledge-stage-card"><span>{tr('Processing now', 'قيد المعالجة الآن')}</span><strong>{processingCount}</strong><small>{processingCount ? tr('Auto-refreshing every 5 seconds', 'يتم التحديث تلقائياً كل 5 ثوانٍ') : tr('No processing jobs active', 'لا توجد عمليات معالجة نشطة')}</small></article>
      </section>

      <section className="knowledge-layout">
        <form ref={uploadPanelRef} id="knowledge-upload" className="panel upload-panel enhanced-upload-panel" onSubmit={uploadDocument}>
          <div className="upload-heading"><div><p className="eyebrow">{tr('Add source', 'إضافة مصدر')}</p><h2>{tr('Upload document', 'رفع مستند')}</h2></div><span className="status-pill neutral">{tr('Max 20 MB', 'الحد 20 م.ب')}</span></div>
          <p className="muted upload-intro">{tr('Add a verified source. Uploading creates the document first; processing and approval happen as separate visible stages.', 'أضف مصدراً موثوقاً. ينشئ الرفع المستند أولاً، ثم تظهر المعالجة والاعتماد كمراحل منفصلة وواضحة.')}</p>

          <label>{tr('Title', 'العنوان')}<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} required placeholder={tr('Alexandria White Paper', 'الورقة البيضاء لمشروع Alexandria')} /></label>
          <div className="upload-fields-row">
            <label>{tr('Document type', 'نوع المستند')}<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="PROJECT_OFFICIAL">{tr('Official project document', 'مستند رسمي للمشروع')}</option><option value="TECHNICAL_REVIEW">{tr('Technical review', 'مراجعة تقنية')}</option><option value="INTERNAL_QA">{tr('Internal Q&A', 'أسئلة وأجوبة داخلية')}</option><option value="DEFENSIVE_PLAYBOOK">{tr('Security playbook', 'دليل أمان')}</option><option value="ADVERSARIAL_TESTING">{tr('Internal testing', 'اختبارات داخلية')}</option></select></label>
            <label>{tr('Language', 'لغة المستند')}<input value={language} onChange={(event) => setLanguage(event.target.value)} required placeholder="en" maxLength={8} dir="ltr" /></label>
          </div>

          <input ref={fileInputRef} className="drop-input" type="file" accept=".docx,.txt,.md" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          <button
            type="button"
            className={`file-drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={dropFile}
          >
            <span className="drop-icon" aria-hidden="true">⇧</span>
            <span><strong>{file ? tr('Choose a different file', 'اختر ملفاً آخر') : tr('Drop a file here or browse', 'اسحب ملفاً هنا أو اختر من الجهاز')}</strong><small>{tr('DOCX, TXT or Markdown · up to 20 MB', 'DOCX أو TXT أو Markdown · حتى 20 ميغابايت')}</small></span>
          </button>

          {file && (
            <div className="selected-file-card" aria-live="polite">
              <span className="file-type-icon" aria-hidden="true">{extensionOf(file).toUpperCase()}</span>
              <span className="selected-file-copy"><strong>{file.name}</strong><small>{formatBytes(file.size)} · {extensionOf(file).toUpperCase()}</small></span>
              <button type="button" className="text-button" disabled={uploading} onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>{tr('Remove', 'إزالة')}</button>
            </div>
          )}

          {(file || uploadStage !== 'idle') && (
            <div className={`upload-progress-card ${uploadStage}`} role="status" aria-live="polite">
              <div className="upload-progress-top"><strong>{uploadStage === 'uploading' ? tr('Uploading file…', 'جارٍ رفع الملف…') : uploadStage === 'queued' ? tr('Upload complete', 'اكتمل الرفع') : uploadStage === 'error' ? tr('Upload needs attention', 'الرفع يحتاج إلى مراجعة') : tr('Ready to upload', 'جاهز للرفع')}</strong><span>{uploadStage === 'queued' ? '3/3' : uploadStage === 'uploading' ? '2/3' : '1/3'}</span></div>
              <div className="upload-step-track" aria-hidden="true"><span className="complete" /><span className={uploadStage === 'uploading' || uploadStage === 'queued' ? 'complete' : ''} /><span className={uploadStage === 'queued' ? 'complete' : uploadStage === 'error' ? 'error' : ''} /></div>
              <div className="upload-step-labels"><span>{tr('File selected', 'تم اختيار الملف')}</span><span>{tr('Secure upload', 'رفع آمن')}</span><span>{tr('Processing queued', 'تمت جدولة المعالجة')}</span></div>
              {uploadStage === 'queued' && lastUploadedName && <small>{tr(`${lastUploadedName} is now visible in the library and will refresh while processing.`, `${lastUploadedName} ظاهر الآن في المكتبة وسيتم تحديث حالته أثناء المعالجة.`)}</small>}
            </div>
          )}

          <button className="primary upload-submit" disabled={uploading || !file || !title.trim()}>{uploading ? tr('Uploading securely…', 'جارٍ الرفع بأمان…') : tr('Upload & start processing', 'رفع وبدء المعالجة')}</button>
          <p className="muted form-note">{tr('Uploading does not make a source available immediately. It must finish processing, receive human approval, and contain indexed chunks.', 'لا يجعل الرفع المصدر متاحاً مباشرة. يجب أن تكتمل معالجته ويحصل على اعتماد يدوي ويحتوي على أجزاء مفهرسة.')}</p>
          {message && <p className={messageIsError ? 'form-error' : 'form-success'} role={messageIsError ? 'alert' : 'status'}>{message}</p>}
        </form>

        <div className="knowledge-main">
          <div className="toolbar-row knowledge-toolbar"><div><p className="eyebrow">{tr('Documents', 'المستندات')}</p><h2>{tr('Source library', 'مكتبة المصادر')}</h2>{processingCount > 0 && <small className="processing-live"><span aria-hidden="true" />{tr(`${processingCount} processing · auto-refresh on`, `${processingCount} قيد المعالجة · التحديث التلقائي يعمل`)}</small>}</div><div className="table-tools"><button type="button" className="compact-button" disabled={!documents?.length} onClick={toggleAllVisible}>{allVisibleSelected ? tr('Clear visible', 'مسح الظاهر') : tr('Select visible', 'تحديد الظاهر')}</button><select className="compact-select" value={filter} onChange={(event) => setFilter(event.target.value as LibraryFilter)}><option value="ALL">{tr('All documents', 'كل المستندات')}</option><option value="PENDING">{tr('Queued', 'في قائمة الانتظار')}</option><option value="PROCESSING">{tr('Processing', 'قيد المعالجة')}</option><option value="READY">{tr('Processed', 'تمت المعالجة')}</option><option value="APPROVED">{tr('Approved', 'معتمد')}</option><option value="AVAILABLE">{tr('Available to assistant', 'متاح للمساعد')}</option><option value="FAILED">{tr('Failed', 'فشل')}</option></select></div></div>

          {selectedIds.length > 0 && (
            <div className="bulk-toolbar" role="status">
              <div className="bulk-toolbar-copy"><span className="bulk-count">{selectedIds.length}</span><span>{tr('documents selected', 'مستندات محددة')}</span></div>
              <div className="bulk-actions"><button type="button" disabled={!approvableSelected.length || bulkBusy} onClick={() => setConfirmAction({ kind: 'bulk-approve' })}>{tr(`Approve processed (${approvableSelected.length})`, `اعتماد المعالج (${approvableSelected.length})`)}</button><button type="button" disabled={bulkBusy} onClick={() => setConfirmAction({ kind: 'bulk-reprocess' })}>{tr('Reprocess selected', 'إعادة معالجة المحدد')}</button><button type="button" disabled={bulkBusy} onClick={() => setSelectedIds([])}>{tr('Clear selection', 'مسح التحديد')}</button></div>
            </div>
          )}

          {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !documents ? <LoadingState label={tr('Loading knowledge documents', 'جارٍ تحميل مستندات قاعدة المعرفة')} /> : documents.length === 0 ? (
            <EmptyState title={emptyCopy.title} message={emptyCopy.message} action={<button type="button" className="primary" onClick={focusUpload}>{tr('Upload a source', 'رفع مصدر')}</button>} />
          ) : <div className="document-list">{documents.map((doc) => {
            const processed = doc.processingStatus === 'READY';
            const available = isAvailable(doc);
            const step = processingStep(doc.processingStatus);
            return (
              <article className={`panel document-card ${selectedIds.includes(doc.id) ? 'selected-document' : ''}`} key={doc.id}>
                <div className="document-head"><div className="document-heading-copy"><label className="document-select"><input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleDocument(doc.id)} /><span>{tr('Select', 'تحديد')}</span></label><div className="chip-row"><span className={`status-pill ${statusClass(doc.processingStatus)}`}>{statusLabel(doc.processingStatus)}</span>{doc.isApproved && <span className="status-pill healthy">{tr('Approved', 'معتمد')}</span>}{available && <span className="status-pill available-pill">{tr('Available', 'متاح')}</span>}</div><h3>{doc.title}</h3><p className="muted">{categoryLabel(doc.category)} · <span dir="ltr">{doc.language.toUpperCase()} · v{doc.version}</span></p></div><strong className="chunk-count">{doc.chunkCount > 0 ? doc.chunkCount : '—'}<small>{doc.chunkCount > 0 ? tr('Indexed chunks', 'أجزاء مفهرسة') : tr('No chunks yet', 'لا توجد أجزاء بعد')}</small></strong></div>

                <div className={`processing-pipeline ${doc.processingStatus === 'FAILED' ? 'failed' : ''}`}>
                  <div className="pipeline-heading"><span>{tr('Processing progress', 'تقدم المعالجة')}</span><strong>{doc.processingStatus === 'FAILED' ? tr('Needs attention', 'يحتاج إلى مراجعة') : `${Math.min(step, 3)}/3`}</strong></div>
                  <div className="pipeline-track" aria-label={tr('Document processing progress', 'تقدم معالجة المستند')}><span className="complete" /><span className={step >= 2 ? doc.processingStatus === 'FAILED' ? 'failed' : 'complete' : 'active'} /><span className={step >= 3 ? 'complete' : ''} /></div>
                  <div className="pipeline-labels"><span>{tr('Uploaded', 'تم الرفع')}</span><span>{tr('Extract & index', 'استخراج وفهرسة')}</span><span>{tr('Processed', 'تمت المعالجة')}</span></div>
                </div>

                <div className="knowledge-readiness-strip" aria-label={tr('Assistant availability requirements', 'متطلبات الإتاحة للمساعد')}>
                  <div className={processed ? 'done' : ''}><span aria-hidden="true">{processed ? '✓' : '1'}</span><strong>{tr('Processed', 'تمت المعالجة')}</strong><small>{processed ? tr('Indexing complete', 'اكتملت الفهرسة') : statusLabel(doc.processingStatus)}</small></div>
                  <div className={doc.isApproved ? 'done' : ''}><span aria-hidden="true">{doc.isApproved ? '✓' : '2'}</span><strong>{tr('Approved', 'معتمد')}</strong><small>{doc.isApproved ? tr('Human approved', 'اعتماد يدوي مكتمل') : tr('Waiting for admin', 'بانتظار المسؤول')}</small></div>
                  <div className={available ? 'done available' : ''}><span aria-hidden="true">{available ? '✓' : '3'}</span><strong>{tr('Available', 'متاح')}</strong><small>{available ? tr('Assistant can use it', 'يمكن للمساعد استخدامه') : tr('Not available yet', 'غير متاح بعد')}</small></div>
                </div>

                {doc.processingError && <p className="form-error">{doc.processingError}</p>}
                <div className="document-footer"><small>{tr('Updated', 'آخر تحديث')} {new Date(doc.updatedAt).toLocaleString(isArabic ? 'ar-LB' : undefined)}</small><div className="decision-actions"><button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus === 'PROCESSING'} onClick={() => setEditingId(doc.id)}>{tr('Open / Edit', 'فتح / تعديل')}</button><button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus !== 'READY' || doc.isApproved} onClick={() => void act(doc.id, 'approve')}>{tr('Approve', 'اعتماد')}</button><button type="button" className="compact-button" disabled={busyId === doc.id} onClick={() => void act(doc.id, 'reprocess')}>{tr('Reprocess', 'إعادة المعالجة')}</button><button type="button" className="compact-button danger" disabled={busyId === doc.id} onClick={() => setConfirmAction({ kind: 'delete', id: doc.id, title: doc.title })}>{tr('Delete', 'حذف')}</button></div></div>
              </article>
            );
          })}</div>}
        </div>
      </section>

      {editingId && <KnowledgeDocumentEditor documentId={editingId} onClose={() => setEditingId(null)} onSaved={() => setReload((n) => n + 1)} />}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmTitle}
        message={<p>{confirmMessage}</p>}
        confirmLabel={confirmAction?.kind === 'delete' ? tr('Delete document', 'حذف المستند') : confirmAction?.kind === 'bulk-approve' ? tr('Approve documents', 'اعتماد المستندات') : tr('Queue reprocessing', 'جدولة إعادة المعالجة')}
        cancelLabel={tr('Cancel', 'إلغاء')}
        tone={confirmAction?.kind === 'delete' ? 'danger' : 'primary'}
        busy={Boolean(busyId) || bulkBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          if (confirmAction?.kind === 'delete') void act(confirmAction.id, 'delete').finally(() => setConfirmAction(null));
          if (confirmAction?.kind === 'bulk-approve') void runBulk('approve');
          if (confirmAction?.kind === 'bulk-reprocess') void runBulk('reprocess');
        }}
      />
    </>
  );
}
