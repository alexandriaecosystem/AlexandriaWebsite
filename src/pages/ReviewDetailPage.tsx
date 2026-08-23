import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConflictState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { decideApplication, getApplicationAudit, getReviewDetail } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { ApplicationAuditDetail, ReviewDetail } from '../types/contracts';

function readableEvidence(item: unknown) {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const value = item as Record<string, unknown>;
    return String(value.rationale ?? value.redacted_excerpt ?? JSON.stringify(item));
  }
  return String(item);
}

const clampScore = (value: unknown) => Math.max(0, Math.min(100, Number(value) || 0));

export function ReviewDetailPage() {
  const { applicationId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ReviewDetail>();
  const [audit, setAudit] = useState<ApplicationAuditDetail>();
  const [error, setError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    Promise.all([
      getReviewDetail(getSupabaseClient(), applicationId),
      getApplicationAudit(getSupabaseClient(), applicationId),
    ])
      .then(([reviewDetail, applicationAudit]) => {
        setDetail(reviewDetail);
        setAudit(applicationAudit);
      })
      .catch(() => setError(true));
  }, [applicationId, reload]);

  async function decide(event: FormEvent, decision: 'APPROVE' | 'REJECT') {
    event.preventDefault();
    if (reason.trim().length < 8 || busy) return;
    setBusy(true);
    try {
      await decideApplication(getSupabaseClient(), applicationId, decision, reason.trim());
      navigate('/reviews');
    } catch (caught) {
      if (String(caught).includes('PENDING_REVIEW')) setConflict(true);
      else setError(true);
    } finally {
      setBusy(false);
    }
  }

  if (conflict) return <ConflictState onReload={() => { setConflict(false); setReload((n) => n + 1); }} />;
  if (error) return <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} />;
  if (!detail || !audit) return <LoadingState label="Loading evaluation" />;

  const score = clampScore(detail.score);
  const rationaleReady = reason.trim().length >= 8;

  return (
    <>
      <Link className="back-link" to="/reviews">← Review queue</Link>
      <header className="page-header detail-header">
        <div>
          <p className="eyebrow">Pending review</p>
          <h1>Application assessment</h1>
          <div className="detail-meta">
            <span className={`platform ${detail.platform}`}>{detail.platform}</span>
            <span className="mono muted">{detail.applicationId}</span>
          </div>
        </div>
        <div className="score-ring" aria-label={`Advisory score ${Math.round(score)} out of 100`}>
          <strong>{Math.round(score)}</strong>
          <span>/100 advisory</span>
        </div>
      </header>

      <div className="detail-grid">
        <section className="panel">
          <p className="panel-kicker">Evaluation</p>
          <h2>Summary</h2>
          <p>{detail.summary || 'No evaluation summary was provided.'}</p>
          <div className="chip-row"><span className="status-pill neutral">{detail.recommendation.replaceAll('_', ' ')}</span></div>
        </section>

        <section className="panel">
          <p className="panel-kicker">Signals</p>
          <h2>Category scores</h2>
          {Object.keys(detail.categoryScores).length ? (
            <div className="score-list">
              {Object.entries(detail.categoryScores).map(([name, categoryScore]) => {
                const normalized = clampScore(categoryScore);
                return <div key={name}><span>{name.replaceAll('_', ' ')}</span><meter min="0" max="100" value={normalized} /><strong>{Math.round(normalized)}</strong></div>;
              })}
            </div>
          ) : <p className="muted">No category scores available.</p>}
        </section>

        <section className="panel signal-panel positive-panel">
          <p className="panel-kicker">Evidence</p>
          <h2>Strengths</h2>
          {detail.strengths.length ? <ul className="signal-list">{detail.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">No strengths recorded.</p>}
        </section>

        <section className="panel signal-panel concern-panel">
          <p className="panel-kicker">Evidence</p>
          <h2>Concerns</h2>
          {detail.concerns.length ? <ul className="signal-list">{detail.concerns.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">No concerns recorded.</p>}
        </section>

        <section className="panel span-two">
          <p className="panel-kicker">Traceability</p>
          <h2>Supporting evidence</h2>
          {detail.evidence.length ? <ol className="evidence-list">{detail.evidence.map((item, index) => <li key={index}>{readableEvidence(item)}</li>)}</ol> : <p className="muted">No evidence excerpts were attached to this evaluation.</p>}
        </section>

        <section className="panel span-two">
          <p className="panel-kicker">Access state</p>
          <h2>Community access</h2>
          {audit.access.length ? <pre className="audit-json">{JSON.stringify(audit.access, null, 2)}</pre> : <p className="muted">No access operation exists. Approval will create the server-authoritative access request.</p>}
        </section>
      </div>

      <section className="decision-panel">
        <div>
          <p className="eyebrow">Human decision required</p>
          <h2>Approve or reject this application</h2>
          <p className="muted">The rationale is stored with the administrator decision and audit history. AI scoring remains advisory.</p>
          <div className="decision-warning">This action changes the application state. Review the evidence before continuing.</div>
        </div>
        <form>
          <label>
            Decision rationale
            <textarea minLength={8} required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Record a clear reason for this decision…" />
            <small className={rationaleReady ? 'helper success-text' : 'helper'}>{rationaleReady ? 'Rationale ready' : 'Enter at least 8 characters'}</small>
          </label>
          <div className="decision-actions">
            <button type="button" className="danger" disabled={busy || !rationaleReady} onClick={(event) => decide(event, 'REJECT')}>Reject</button>
            <button type="button" className="primary" disabled={busy || !rationaleReady} onClick={(event) => decide(event, 'APPROVE')}>{busy ? 'Saving…' : 'Approve & queue access'}</button>
          </div>
        </form>
      </section>
    </>
  );
}
