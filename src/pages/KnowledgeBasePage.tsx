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

const statusClass = (status: string) => status === 'READY' ? 'healthy' : status === 'FAILED' ? 'danger' : 'neutral';

export function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<KnowledgeDocumentSummary[]>();
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('ALL');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
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
      setMessage(`Uploaded ${file.name}. Document ${created.id} is now waiting for server-side processing.`);
      setTitle(''); setFile(null); setReload((n) => n + 1);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally { setUploading(false); }
  }

  async function act(id: string, action: 'approve' | 'reprocess' | 'delete') {
    if (busyId) return;
    if (action === 'delete' && !window.confirm('Delete this knowledge document and its chunks?')) return;
    setBusyId(id); setMessage('');
    try {
      if (action === 'approve') await approveKnowledgeDocument(getSupabaseClient(), id);
      if (action === 'reprocess') await requestKnowledgeDocumentReprocessing(getSupabaseClient(), id);
      if (action === 'delete') await deleteKnowledgeDocument(getSupabaseClient(), id);
      setMessage(action === 'approve' ? 'Document approved.' : action === 'reprocess' ? 'Document reset for reprocessing.' : 'Document deleted.');
      setReload((n) => n + 1);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Action failed.');
    } finally { setBusyId(null); }
  }

  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">RAG sources</p><h1>Knowledge base</h1><p className="muted page-subtitle">Upload approved project sources, track processing, and control which documents can feed retrieval.</p></div>
        <span className="status-pill neutral">{total} documents</span>
      </header>

      <section className="metric-grid compact-metrics">
        <article className="metric-card"><span>Ready</span><strong>{readyCount}</strong><small>Embedding pipeline completed</small></article>
        <article className="metric-card"><span>Approved</span><strong>{approvedCount}</strong><small>Eligible for project retrieval</small></article>
      </section>

      <section className="knowledge-layout">
        <form className="panel upload-panel" onSubmit={uploadDocument}>
          <p className="eyebrow">Add source</p><h2>Upload document</h2>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} required placeholder="Alexandria White Paper" /></label>
          <label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}><option>PROJECT_OFFICIAL</option><option>TECHNICAL_REVIEW</option><option>INTERNAL_QA</option><option>DEFENSIVE_PLAYBOOK</option><option>ADVERSARIAL_TESTING</option></select></label>
          <label>Language<input value={language} onChange={(event) => setLanguage(event.target.value)} required placeholder="en" maxLength={8} /></label>
          <label>File<input type="file" accept=".pdf,.doc,.docx,.txt,.md" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
          <button className="primary" disabled={uploading || !file || !title.trim()}>{uploading ? 'Uploading…' : 'Upload to Supabase'}</button>
          <p className="muted form-note">The browser uploads only to the protected <code>knowledge-base</code> bucket. n8n credentials are never exposed here.</p>
          {message && <p className="form-success" role="status">{message}</p>}
        </form>

        <div className="knowledge-main">
          <div className="toolbar-row"><div><p className="eyebrow">Documents</p><h2>Source library</h2></div><select className="compact-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="PROCESSING">Processing</option><option value="READY">Ready</option><option value="FAILED">Failed</option></select></div>

          {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !documents ? <LoadingState label="Loading knowledge documents" /> : documents.length === 0 ? (
            <div className="panel empty-state"><h3>No documents found</h3><p className="muted">Upload a source or choose another status filter.</p></div>
          ) : (
            <div className="document-list">{documents.map((doc) => (
              <article className="panel document-card" key={doc.id}>
                <div className="document-head"><div><div className="chip-row"><span className={`status-pill ${statusClass(doc.processingStatus)}`}>{doc.processingStatus}</span>{doc.isApproved && <span className="status-pill healthy">Approved</span>}</div><h3>{doc.title}</h3><p className="muted">{doc.category} · {doc.language.toUpperCase()} · v{doc.version}</p></div><strong className="chunk-count">{doc.chunkCount}<small>chunks</small></strong></div>
                {doc.processingError && <p className="form-error">{doc.processingError}</p>}
                <div className="document-footer"><small>Updated {new Date(doc.updatedAt).toLocaleString()}</small><div className="decision-actions">
                  <button type="button" className="compact-button" disabled={busyId === doc.id || doc.processingStatus !== 'READY' || doc.isApproved} onClick={() => act(doc.id, 'approve')}>Approve</button>
                  <button type="button" className="compact-button" disabled={busyId === doc.id} onClick={() => act(doc.id, 'reprocess')}>Reprocess</button>
                  <button type="button" className="compact-button danger" disabled={busyId === doc.id} onClick={() => act(doc.id, 'delete')}>Delete</button>
                </div></div>
              </article>
            ))}</div>
          )}
        </div>
      </section>
    </>
  );
}
