import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  approveKnowledgeDocument,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeConflicts,
  listKnowledgeDocuments,
  requestKnowledgeDocumentReprocessing,
} from '../services/admin';
import type { KnowledgeConflict } from '../types/contracts';
import { getSupabaseClient } from '../services/supabase';
import type { KnowledgeDocumentSummary } from '../types/contracts';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { ConfirmDialog, useToast } from '../components/Feedback';
import { KnowledgeDocumentEditor } from '../components/KnowledgeDocumentEditor';
import { useLanguage } from '../i18n/LanguageContext';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ['docx', 'txt', 'md', 'pdf'];
type ConfirmAction = { kind: 'delete'; id: string; title: string } | null;
type UploadStage = 'idle' | 'uploading' | 'queued' | 'error';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extensionOf(file: File) {
  return file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
}

function scanCurrent(doc: KnowledgeDocumentSummary) {
  return doc.conflictScanStatus === 'READY' && doc.conflictScannedVersion === doc.version;
}

export function KnowledgeBasePage() {
  const { tr } = useLanguage();
  const { notify } = useToast();
  const [allDocuments, setAllDocuments] = useState<KnowledgeDocumentSummary[]>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
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
  const [pendingTestId, setPendingTestId] = useState<string | null>(null);
  const [testDoc, setTestDoc] = useState<KnowledgeDocumentSummary | null>(null);
  const [testConflicts, setTestConflicts] = useState<KnowledgeConflict[]>([]);
  const [testBusy, setTestBusy] = useState(false);
  const [conflictViewDoc, setConflictViewDoc] = useState<KnowledgeDocumentSummary | null>(null);
  const [conflictViewItems, setConflictViewItems] = useState<KnowledgeConflict[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadDetailsRef = useRef<HTMLDetailsElement>(null);
  const uploadPanelRef = useRef<HTMLFormElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const categoryLabel = (value: string) => ({
    PROJECT_OFFICIAL: tr('Official project document', 'مستند رسمي للمشروع'),
    TECHNICAL_REVIEW: tr('Technical review', 'مراجعة تقنية'),
    INTERNAL_QA: tr('Internal Q&A', 'أسئلة وأجوبة داخلية'),
    DEFENSIVE_PLAYBOOK: tr('Security playbook', 'دليل أمان'),
    ADVERSARIAL_TESTING: tr('Internal testing', 'اختبارات داخلية'),
    QUIZ_REFERENCE: tr('Quiz reference', 'مرجع الأسئلة'),
  }[value] ?? value.replaceAll('_', ' '));

  useEffect(() => {
    setError(false);
    listKnowledgeDocuments(getSupabaseClient())
      .then((result) => setAllDocuments(result.items))
      .catch(() => setError(true));
  }, [reload]);

  const processingCount = useMemo(() => allDocuments?.filter((item) => (['PENDING', 'PROCESSING'].includes(item.processingStatus) || (item.processingStatus === 'READY' && ['PENDING', 'PROCESSING'].includes(item.conflictScanStatus)))).length ?? 0, [allDocuments]);

  useEffect(() => {
    if (!processingCount && !pendingTestId) return undefined;
    const timer = window.setInterval(() => setReload((value) => value + 1), 5000);
    return () => window.clearInterval(timer);
  }, [processingCount, pendingTestId]);

  const activeDocuments = useMemo(() => allDocuments?.filter((item) => item.isApproved) ?? [], [allDocuments]);
  const inactiveDocuments = useMemo(() => allDocuments?.filter((item) => !item.isApproved) ?? [], [allDocuments]);

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
      const text = tr('Unsupported file type. Choose DOCX, PDF, TXT or Markdown.', 'نوع الملف غير مدعوم. اختر DOCX أو PDF أو TXT أو Markdown.');
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
    if (uploadDetailsRef.current) uploadDetailsRef.current.open = true;
    titleRef.current?.focus({ preventScroll: true });
    uploadPanelRef.current?.scrollIntoView({ block: 'nearest' });
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
      const text = tr(`Uploaded ${uploadingName}. It appears in the Inactive box while it is being read.`, `تم رفع ${uploadingName}. سيظهر في صندوق غير الفعّال أثناء قراءته.`);
      setMessage(text);
      setMessageIsError(false);
      setLastUploadedName(uploadingName);
      setUploadStage('queued');
      notify({ tone: 'success', title: tr('Added to Inactive', 'أُضيف إلى غير الفعّال'), message: text });
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

  async function act(id: string, action: 'reprocess' | 'delete') {
    if (busyId) return;
    setBusyId(id); setMessage(''); setMessageIsError(false);
    try {
      if (action === 'reprocess') await requestKnowledgeDocumentReprocessing(getSupabaseClient(), id);
      if (action === 'delete') await deleteKnowledgeDocument(getSupabaseClient(), id);
      const text = action === 'reprocess' ? tr('Reading the document again…', 'جارٍ قراءة المستند من جديد…') : tr('Document deleted.', 'تم حذف المستند.');
      notify({ tone: 'success', title: text });
      setReload((n) => n + 1);
    } catch (caught) {
      const text = caught instanceof Error ? caught.message : tr('Action failed.', 'فشل الإجراء.');
      setMessage(text);
      setMessageIsError(true);
      notify({ tone: 'error', title: tr('Action failed', 'فشل الإجراء'), message: text });
    } finally { setBusyId(null); }
  }

  // The owner's "Test" flow: make sure the conflict scan matches the current
  // version, then present the result as a plain add / bypass / no decision.
  async function testDocument(doc: KnowledgeDocumentSummary) {
    if (scanCurrent(doc)) {
      await openTestResult(doc);
      return;
    }
    try {
      await requestKnowledgeDocumentReprocessing(getSupabaseClient(), doc.id);
      setPendingTestId(doc.id);
      notify({ tone: 'success', title: tr('Content test started', 'بدأ فحص المحتوى'), message: tr('Checking this content against the Active knowledge. The result opens automatically in about a minute.', 'جارٍ فحص هذا المحتوى مقابل المعرفة الفعّالة. ستظهر النتيجة تلقائياً خلال دقيقة تقريباً.') });
    } catch (caught) {
      notify({ tone: 'error', title: tr('Could not start the test', 'تعذر بدء الفحص'), message: caught instanceof Error ? caught.message : undefined });
    }
  }

  async function openTestResult(doc: KnowledgeDocumentSummary) {
    setPendingTestId(null);
    if (doc.blockingConflictCount > 0) {
      try {
        const result = await listKnowledgeConflicts(getSupabaseClient(), doc.id);
        setTestConflicts(result.items.filter((item) => ['OPEN', 'REVIEW_REQUIRED'].includes(item.status)));
      } catch {
        setTestConflicts([]);
      }
    } else {
      setTestConflicts([]);
    }
    setTestDoc(doc);
  }

  useEffect(() => {
    if (!pendingTestId || !allDocuments) return;
    const doc = allDocuments.find((item) => item.id === pendingTestId);
    if (doc && scanCurrent(doc)) void openTestResult(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDocuments, pendingTestId]);

  async function resolveTest(approveIt: boolean, bypass: boolean) {
    if (!testDoc) return;
    if (!approveIt) {
      setTestDoc(null);
      setTestConflicts([]);
      return;
    }
    setTestBusy(true);
    try {
      await approveKnowledgeDocument(getSupabaseClient(), testDoc.id, { bypassConflicts: bypass });
      notify({
        tone: 'success',
        title: bypass ? tr('Moved to Active with the conflict kept', 'انتقل إلى الفعّال مع إبقاء التعارض') : tr('Moved to Active', 'انتقل إلى الفعّال'),
        message: bypass ? tr('The document is now Active. The conflict stays recorded and is not auto-resolved.', 'المستند أصبح فعّالاً. يبقى التعارض مسجلاً ولا يُحل تلقائياً.') : undefined,
      });
      setTestDoc(null);
      setTestConflicts([]);
      setReload((n) => n + 1);
    } catch (caught) {
      notify({ tone: 'error', title: tr('Could not activate the document', 'تعذر تفعيل المستند'), message: caught instanceof Error ? caught.message : undefined });
    } finally {
      setTestBusy(false);
    }
  }

  async function showRecordedConflict(doc: KnowledgeDocumentSummary) {
    try {
      const result = await listKnowledgeConflicts(getSupabaseClient(), doc.id);
      setConflictViewItems(result.items.filter((item) => ['OPEN', 'REVIEW_REQUIRED'].includes(item.status)));
    } catch {
      setConflictViewItems([]);
    }
    setConflictViewDoc(doc);
  }

  function conflictPairs(doc: KnowledgeDocumentSummary | null, items: KnowledgeConflict[]) {
    return items.slice(0, 3).map((conflict) => {
      const thisDocIsA = conflict.sourceADocumentId === doc?.id;
      return {
        id: conflict.id,
        mine: thisDocIsA ? conflict.claimA : conflict.claimB,
        other: thisDocIsA ? conflict.claimB : conflict.claimA,
        otherTitle: (thisDocIsA ? conflict.sourceBTitle : conflict.sourceATitle) || tr('Other knowledge', 'معرفة أخرى'),
      };
    });
  }

  function inactiveStatus(doc: KnowledgeDocumentSummary): { label: string; tone: string; hint?: string } {
    if (doc.processingStatus === 'FAILED') return { label: tr('Processing failed', 'فشلت المعالجة'), tone: 'negative', hint: tr('Retry, or delete and upload a corrected file.', 'أعد المحاولة أو احذفه وارفع ملفاً مصححاً.') };
    if (doc.processingStatus !== 'READY') return { label: tr('Processing…', 'قيد المعالجة…'), tone: 'neutral', hint: tr('The file is being read. This takes about a minute.', 'جارٍ قراءة الملف. يستغرق ذلك حوالي دقيقة.') };
    if (doc.conflictScanStatus === 'FAILED') return { label: tr('Test failed', 'فشل الفحص'), tone: 'negative', hint: tr('Run the content test again.', 'أعد تشغيل فحص المحتوى.') };
    if (!scanCurrent(doc)) return { label: tr('Checking for conflicts…', 'جارٍ فحص التعارضات…'), tone: 'neutral' };
    if (doc.blockingConflictCount > 0) return { label: tr('Conflict found', 'يوجد تعارض'), tone: 'negative', hint: tr('Run the content test to decide: Bypass or No.', 'شغّل فحص المحتوى لتقرر: تجاوز أو لا.') };
    return { label: tr('Ready to activate', 'جاهز للتفعيل'), tone: 'healthy' };
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{tr('Knowledge base', 'قاعدة المعرفة')}</h1>
          <p className="muted page-subtitle">{tr('Active knowledge answers members. Inactive is the waiting room for new content.', 'المعرفة الفعّالة تجيب الأعضاء. غير الفعّال هو غرفة انتظار المحتوى الجديد.')}</p>
        </div>
        <button type="button" className="primary" onClick={focusUpload}>{tr('Add knowledge', 'إضافة معرفة')}</button>
      </header>
      {message && <p className={messageIsError ? 'form-error' : 'form-success'} role={messageIsError ? 'alert' : 'status'}>{message}</p>}

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !allDocuments ? <LoadingState label={tr('Loading knowledge documents', 'جارٍ تحميل مستندات قاعدة المعرفة')} /> : (
        <div className="kb-boxes">
          <section className="panel kb-box kb-box-active" aria-label={tr('Active knowledge', 'المعرفة الفعّالة')}>
            <div className="section-heading kb-box-heading">
              <div>
                <p className="eyebrow">{tr('Used for answers', 'تُستخدم في الإجابات')}</p>
                <h2>{tr('Active', 'فعّال')} <span className="library-total">{activeDocuments.length}</span></h2>
              </div>
              <span className="status-pill healthy">{tr('Live', 'مباشر')}</span>
            </div>
            <p className="muted">{tr('Everything in this box is what the assistant relies on when answering members.', 'كل ما في هذا الصندوق هو ما يعتمد عليه المساعد عند الإجابة على الأعضاء.')}</p>
            <div className="kb-doc-list">
              {activeDocuments.map((doc) => {
                const conflicted = doc.blockingConflictCount > 0;
                const empty = doc.chunkCount === 0 && doc.processingStatus === 'READY';
                const failed = doc.processingStatus === 'FAILED';
                return (
                  <article className="kb-doc-row" key={doc.id}>
                    <div className="kb-doc-copy">
                      <h3>{doc.title}</h3>
                      <p className="muted">{categoryLabel(doc.category)} · <span dir="ltr">{doc.language.toUpperCase()}</span></p>
                      {conflicted && <p className="form-error">{tr('This document contradicts other knowledge. Press Open to correct the text — it returns to Inactive for a new test after you save.', 'يتعارض هذا المستند مع معرفة أخرى. اضغط «فتح» لتصحيح النص — سيعود إلى غير الفعّال لفحص جديد بعد الحفظ.')}</p>}
                      {failed && <p className="form-error">{tr('Processing failed', 'فشلت المعالجة')}</p>}
                      {empty && !failed && <p className="form-error">{tr('No indexed content', 'لا يوجد محتوى مفهرس')}</p>}
                    </div>
                    <div className="kb-doc-actions">
                      <span className={`status-pill ${conflicted || failed || empty ? 'negative' : 'healthy'}`}>{conflicted ? tr('Conflict recorded', 'تعارض مسجل') : failed || empty ? tr('Needs attention', 'يحتاج انتباه') : tr('In use', 'قيد الاستخدام')}</span>
                      {conflicted && <button type="button" className="compact-button primary" disabled={Boolean(busyId)} onClick={() => void showRecordedConflict(doc)}>{tr('See conflict', 'عرض التعارض')}</button>}
                      <button type="button" className="compact-button" disabled={Boolean(busyId)} onClick={() => setEditingId(doc.id)}>{tr('Open', 'فتح')}</button>
                      <button type="button" className="compact-button danger" disabled={Boolean(busyId)} onClick={() => setConfirmAction({ kind: 'delete', id: doc.id, title: doc.title })}>{tr('Delete', 'حذف')}</button>
                    </div>
                  </article>
                );
              })}
              {!activeDocuments.length && <EmptyState title={tr('Nothing is Active yet', 'لا يوجد شيء فعّال بعد')} message={tr('Add content in the Inactive box, test it, then activate it.', 'أضف المحتوى في صندوق غير الفعّال، افحصه، ثم فعّله.')} />}
            </div>
          </section>

          <section className="panel kb-box" aria-label={tr('Inactive knowledge', 'المعرفة غير الفعّالة')}>
            <div className="section-heading kb-box-heading">
              <div>
                <p className="eyebrow">{tr('Waiting room', 'غرفة الانتظار')}</p>
                <h2>{tr('Inactive', 'غير فعّال')} <span className="library-total">{inactiveDocuments.length}</span></h2>
              </div>
              <button type="button" className="compact-button primary" onClick={focusUpload}>{tr('+ Add', '+ إضافة')}</button>
            </div>
            <p className="muted">{tr('New content lands here. Run a content test, then choose whether to activate it. Nothing here is used for answers.', 'المحتوى الجديد يصل إلى هنا. شغّل فحص المحتوى ثم قرر التفعيل. لا شيء هنا يُستخدم في الإجابات.')}</p>

            <details ref={uploadDetailsRef} className="knowledge-upload-disclosure">
              <summary>{tr('Add a source', 'إضافة مصدر')}<span>{tr('DOCX, PDF, TXT or Markdown · up to 20 MB', 'DOCX أو PDF أو TXT أو Markdown · حتى 20 ميغابايت')}</span></summary>
              <form ref={uploadPanelRef} id="knowledge-upload" className="panel upload-panel enhanced-upload-panel" onSubmit={uploadDocument}>
                <label>{tr('Title', 'العنوان')}<input ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} required placeholder={tr('Alexandria White Paper', 'الورقة البيضاء لمشروع Alexandria')} /></label>
                <div className="upload-fields-row">
                  <label>{tr('Document type', 'نوع المستند')}<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="PROJECT_OFFICIAL">{tr('Official project document', 'مستند رسمي للمشروع')}</option><option value="TECHNICAL_REVIEW">{tr('Technical review', 'مراجعة تقنية')}</option><option value="INTERNAL_QA">{tr('Internal Q&A', 'أسئلة وأجوبة داخلية')}</option><option value="DEFENSIVE_PLAYBOOK">{tr('Security playbook', 'دليل أمان')}</option><option value="ADVERSARIAL_TESTING">{tr('Internal testing', 'اختبارات داخلية')}</option></select></label>
                  <label>{tr('Language', 'لغة المستند')}<input value={language} onChange={(event) => setLanguage(event.target.value)} required placeholder="en" maxLength={8} dir="ltr" /></label>
                </div>
                <input ref={fileInputRef} className="drop-input" type="file" accept=".docx,.txt,.md,.pdf" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
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
                  <span><strong>{file ? tr('Choose a different file', 'اختر ملفاً آخر') : tr('Drop a file here or browse', 'اسحب ملفاً هنا أو اختر من الجهاز')}</strong><small>{tr('DOCX, PDF, TXT or Markdown · up to 20 MB', 'DOCX أو PDF أو TXT أو Markdown · حتى 20 ميغابايت')}</small></span>
                </button>
                {file && (
                  <div className="selected-file-card" aria-live="polite">
                    <span className="file-type-icon" aria-hidden="true">{extensionOf(file).toUpperCase()}</span>
                    <span className="selected-file-copy"><strong>{file.name}</strong><small>{formatBytes(file.size)} · {extensionOf(file).toUpperCase()}</small></span>
                    <button type="button" className="text-button" disabled={uploading} onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>{tr('Remove', 'إزالة')}</button>
                  </div>
                )}
                {uploadStage === 'queued' && lastUploadedName && <p className="form-success">{tr(`${lastUploadedName} was added to the Inactive box.`, `أُضيف ${lastUploadedName} إلى صندوق غير الفعّال.`)}</p>}
                <button className="primary upload-submit" disabled={uploading || !file || !title.trim()}>{uploading ? tr('Uploading…', 'جارٍ الرفع…') : tr('Add to Inactive', 'إضافة إلى غير الفعّال')}</button>
              </form>
            </details>

            <div className="kb-doc-list">
              {inactiveDocuments.map((doc) => {
                const status = inactiveStatus(doc);
                const canTest = doc.processingStatus === 'READY';
                return (
                  <article className="kb-doc-row" key={doc.id}>
                    <div className="kb-doc-copy">
                      <h3>{doc.title}</h3>
                      <p className="muted">{categoryLabel(doc.category)} · <span dir="ltr">{doc.language.toUpperCase()}</span></p>
                      {status.hint && <p className="muted"><small>{status.hint}</small></p>}
                    </div>
                    <div className="kb-doc-actions">
                      <span className={`status-pill ${status.tone}`}>{status.label}</span>
                      {canTest && (
                        <button type="button" className="compact-button primary" disabled={Boolean(busyId) || pendingTestId === doc.id} onClick={() => void testDocument(doc)}>
                          {pendingTestId === doc.id ? tr('Testing…', 'جارٍ الفحص…') : tr('Content test', 'فحص المحتوى')}
                        </button>
                      )}
                      {doc.processingStatus === 'FAILED' && <button type="button" className="compact-button" disabled={Boolean(busyId)} onClick={() => void act(doc.id, 'reprocess')}>{tr('Retry', 'إعادة المحاولة')}</button>}
                      <button type="button" className="compact-button" disabled={Boolean(busyId) || doc.processingStatus === 'PROCESSING'} onClick={() => setEditingId(doc.id)}>{tr('Open', 'فتح')}</button>
                      <button type="button" className="compact-button danger" disabled={Boolean(busyId)} onClick={() => setConfirmAction({ kind: 'delete', id: doc.id, title: doc.title })}>{tr('Delete', 'حذف')}</button>
                    </div>
                  </article>
                );
              })}
              {!inactiveDocuments.length && <p className="muted empty-row">{tr('Nothing is waiting. Use “+ Add” to upload new knowledge.', 'لا يوجد شيء في الانتظار. استخدم «+ إضافة» لرفع معرفة جديدة.')}</p>}
            </div>
          </section>
        </div>
      )}

      {editingId && <KnowledgeDocumentEditor documentId={editingId} onClose={() => setEditingId(null)} onSaved={() => setReload((n) => n + 1)} />}

      <ConfirmDialog
        open={confirmAction?.kind === 'delete'}
        title={tr('Delete knowledge document?', 'حذف مستند قاعدة المعرفة؟')}
        message={<p>{tr(`“${confirmAction?.title}” will be removed from the knowledge library.`, `سيتم حذف “${confirmAction?.title}” من مكتبة المعرفة.`)}</p>}
        confirmLabel={tr('Delete document', 'حذف المستند')}
        cancelLabel={tr('Cancel', 'إلغاء')}
        tone="danger"
        busy={Boolean(busyId)}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => { if (confirmAction) void act(confirmAction.id, 'delete').finally(() => setConfirmAction(null)); }}
      />

      <ConfirmDialog
        open={Boolean(testDoc) && testDoc!.blockingConflictCount === 0}
        title={tr('No conflicts found', 'لم يتم العثور على تعارضات')}
        message={<p>{tr(`“${testDoc?.title}” was checked against the Active knowledge and no conflicts were found. Add it to Active knowledge?`, `تم فحص “${testDoc?.title}” مقابل المعرفة الفعّالة ولم يُعثر على تعارضات. إضافته إلى المعرفة الفعّالة؟`)}</p>}
        confirmLabel={tr('Yes, add to Active', 'نعم، أضِفه إلى الفعّال')}
        cancelLabel={tr('No', 'لا')}
        tone="primary"
        busy={testBusy}
        onCancel={() => void resolveTest(false, false)}
        onConfirm={() => void resolveTest(true, false)}
      />

      <ConfirmDialog
        open={Boolean(testDoc) && (testDoc?.blockingConflictCount ?? 0) > 0}
        title={tr('Conflict found', 'تم العثور على تعارض')}
        message={
          <div>
            <p>{tr(`“${testDoc?.title}” says the opposite of something in your Active knowledge:`, `“${testDoc?.title}” يقول عكس شيء موجود في معرفتك الفعّالة:`)}</p>
            <div className="kb-conflict-list">
              {conflictPairs(testDoc, testConflicts).map((pair) => (
                <div className="kb-conflict-pair" key={pair.id}>
                  <p><span className="kb-conflict-side new">{tr('This document', 'هذا المستند')}</span> “{pair.mine}”</p>
                  <p><span className="kb-conflict-side active">{pair.otherTitle}</span> “{pair.other}”</p>
                </div>
              ))}
              {testConflicts.length > 3 && <p className="muted">{tr(`…and ${testConflicts.length - 3} more.`, `…و${testConflicts.length - 3} أخرى.`)}</p>}
              {!testConflicts.length && <p className="muted">{tr('Conflict details are listed in the advanced monitoring section.', 'تفاصيل التعارض مذكورة في قسم المراقبة المتقدمة.')}</p>}
            </div>
            <p>{tr('You have three options:', 'لديك ثلاثة خيارات:')}</p>
            <ul className="signal-list">
              <li><strong>{tr('Fix the text', 'تصحيح النص')}</strong> — {tr('edit this document here, then run the test again.', 'عدّل هذا المستند هنا ثم أعد الفحص.')}</li>
              <li><strong>{tr('Bypass', 'تجاوز')}</strong> — {tr('activate it as it is; the conflict stays recorded and is never auto-resolved.', 'فعّله كما هو؛ يبقى التعارض مسجلاً ولا يُحل تلقائياً أبداً.')}</li>
              <li><strong>{tr('No', 'لا')}</strong> — {tr('leave it Inactive and decide later.', 'اتركه غير فعّال وقرر لاحقاً.')}</li>
            </ul>
            <button
              type="button"
              className="compact-button primary kb-fix-button"
              disabled={testBusy}
              onClick={() => { const id = testDoc?.id; setTestDoc(null); setTestConflicts([]); if (id) setEditingId(id); }}
            >
              {tr('Fix the text now', 'صحّح النص الآن')}
            </button>
            <p className="muted"><small>{tr('If the Active document is the wrong one instead, close this, open that document in the Active box and correct it there.', 'إذا كان المستند الفعّال هو الخاطئ، أغلق هذه النافذة وافتح ذلك المستند في صندوق الفعّال وصححه هناك.')}</small></p>
          </div>
        }
        confirmLabel={tr('Bypass — add anyway', 'تجاوز — أضِفه على أي حال')}
        cancelLabel={tr('No', 'لا')}
        tone="danger"
        busy={testBusy}
        onCancel={() => void resolveTest(false, false)}
        onConfirm={() => void resolveTest(true, true)}
      />

      <ConfirmDialog
        open={Boolean(conflictViewDoc)}
        title={tr('What this conflict is', 'ما هو هذا التعارض')}
        message={
          <div>
            <p>{tr(`“${conflictViewDoc?.title}” is Active, but it says the opposite of other knowledge:`, `“${conflictViewDoc?.title}” فعّال، لكنه يقول عكس معرفة أخرى:`)}</p>
            <div className="kb-conflict-list">
              {conflictPairs(conflictViewDoc, conflictViewItems).map((pair) => (
                <div className="kb-conflict-pair" key={pair.id}>
                  <p><span className="kb-conflict-side new">{tr('This document', 'هذا المستند')}</span> “{pair.mine}”</p>
                  <p><span className="kb-conflict-side active">{pair.otherTitle}</span> “{pair.other}”</p>
                </div>
              ))}
              {conflictViewItems.length > 3 && <p className="muted">{tr(`…and ${conflictViewItems.length - 3} more.`, `…و${conflictViewItems.length - 3} أخرى.`)}</p>}
              {!conflictViewItems.length && <p className="muted">{tr('The details are listed in the advanced monitoring section below.', 'التفاصيل مذكورة في قسم المراقبة المتقدمة بالأسفل.')}</p>}
            </div>
            <p className="muted">{tr('Correct whichever document is wrong. Saving an edit sends that document back to Inactive for a fresh test.', 'صحّح المستند الخاطئ أياً كان. حفظ التعديل يعيد ذلك المستند إلى غير الفعّال لفحص جديد.')}</p>
          </div>
        }
        confirmLabel={tr('Fix this document', 'تصحيح هذا المستند')}
        cancelLabel={tr('Close', 'إغلاق')}
        tone="primary"
        onCancel={() => { setConflictViewDoc(null); setConflictViewItems([]); }}
        onConfirm={() => { const id = conflictViewDoc?.id; setConflictViewDoc(null); setConflictViewItems([]); if (id) setEditingId(id); }}
      />
    </>
  );
}
