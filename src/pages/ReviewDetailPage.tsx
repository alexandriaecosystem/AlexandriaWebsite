import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConflictState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { decideApplication, getApplicationAudit, getReviewDetail } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { ApplicationAuditDetail, ReviewDetail } from '../types/contracts';

function readableEvidence(item: unknown) { if (typeof item === 'string') return item; if (item && typeof item === 'object') return String((item as Record<string, unknown>).rationale ?? (item as Record<string, unknown>).redacted_excerpt ?? JSON.stringify(item)); return String(item); }
export function ReviewDetailPage() {
  const { applicationId = '' } = useParams(); const navigate = useNavigate();
  const [detail, setDetail] = useState<ReviewDetail>(); const [audit, setAudit] = useState<ApplicationAuditDetail>();
  const [error, setError] = useState(false); const [conflict, setConflict] = useState(false); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [reload, setReload] = useState(0);
  useEffect(() => { setError(false); Promise.all([getReviewDetail(getSupabaseClient(), applicationId), getApplicationAudit(getSupabaseClient(), applicationId)]).then(([d, a]) => { setDetail(d); setAudit(a); }).catch(() => setError(true)); }, [applicationId, reload]);
  async function decide(event: FormEvent, decision: 'APPROVE' | 'REJECT') { event.preventDefault(); if (reason.trim().length < 8) return; setBusy(true); try { await decideApplication(getSupabaseClient(), applicationId, decision, reason.trim()); navigate('/reviews'); } catch (e) { if (String(e).includes('PENDING_REVIEW')) setConflict(true); else setError(true); } finally { setBusy(false); } }
  if (conflict) return <ConflictState onReload={() => { setConflict(false); setReload((n) => n + 1); }} />;
  if (error) return <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />;
  if (!detail || !audit) return <LoadingState label="Loading evaluation" />;
  return <><Link className="back-link" to="/reviews">← Review queue</Link><header className="page-header detail-header"><div><p className="eyebrow">Pending review</p><h1>Application assessment</h1><p className="muted mono">{detail.applicationId}</p></div><div className="score-ring"><strong>{Math.round(detail.score)}</strong><span>/100 advisory</span></div></header>
    <div className="detail-grid"><section className="panel"><h2>Evaluation summary</h2><p>{detail.summary || 'No evaluation summary was provided.'}</p><div className="chip-row"><span className={`platform ${detail.platform}`}>{detail.platform}</span><span className="status-pill">{detail.recommendation.replaceAll('_', ' ')}</span></div></section>
    <section className="panel"><h2>Category signals</h2>{Object.keys(detail.categoryScores).length ? <div className="score-list">{Object.entries(detail.categoryScores).map(([name, score]) => <div key={name}><span>{name.replaceAll('_', ' ')}</span><meter min="0" max="100" value={Number(score)} /><strong>{Math.round(Number(score))}</strong></div>)}</div> : <p className="muted">No category scores available.</p>}</section>
    <section className="panel"><h2>Strengths</h2>{detail.strengths.length ? <ul>{detail.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">No strengths recorded.</p>}</section>
    <section className="panel"><h2>Concerns</h2>{detail.concerns.length ? <ul>{detail.concerns.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="muted">No concerns recorded.</p>}</section>
    <section className="panel span-two"><h2>Supporting evidence</h2>{detail.evidence.length ? <ol className="evidence-list">{detail.evidence.map((x, i) => <li key={i}>{readableEvidence(x)}</li>)}</ol> : <p className="muted">No evidence excerpts were attached to this evaluation.</p>}</section>
    <section className="panel span-two"><h2>Community access</h2>{audit.access.length ? <pre className="audit-json">{JSON.stringify(audit.access, null, 2)}</pre> : <p className="muted">No access operation exists. Approval will create the server-authoritative access request.</p>}</section></div>
    <section className="decision-panel"><div><p className="eyebrow">Human decision required</p><h2>Approve or reject this application</h2><p>Your reason is written to the immutable admin decision and audit history.</p></div><form><label>Decision rationale<textarea minLength={8} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Record the reason for this decision…" /></label><div className="decision-actions"><button className="danger" disabled={busy || reason.trim().length < 8} onClick={(e) => decide(e, 'REJECT')}>Reject</button><button className="primary" disabled={busy || reason.trim().length < 8} onClick={(e) => decide(e, 'APPROVE')}>{busy ? 'Saving…' : 'Approve & queue access'}</button></div></form></section>
  </>;
}
