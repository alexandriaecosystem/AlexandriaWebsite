import { useState, type FormEvent } from 'react';
import { approveAnnouncement, createAnnouncement } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { MessagingPlatform } from '../types/contracts';

const allPlatforms: MessagingPlatform[] = ['telegram', 'discord', 'whatsapp'];

export function AnnouncementsPage() {
  const [content, setContent] = useState('');
  const [destination, setDestination] = useState<'GENERAL' | 'APPROVED'>('GENERAL');
  const [platforms, setPlatforms] = useState<MessagingPlatform[]>(['telegram']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  function toggle(platform: MessagingPlatform) {
    setPlatforms((selected) => selected.includes(platform)
      ? selected.filter((item) => item !== platform)
      : [...selected, platform]);
  }

  async function submit(event: FormEvent, approve: boolean) {
    event.preventDefault();
    if (busy || !content.trim() || !platforms.length) return;
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const id = await createAnnouncement(getSupabaseClient(), {
        content: content.trim(),
        destination,
        platforms,
      });
      if (approve) await approveAnnouncement(getSupabaseClient(), id);
      setMessage(approve ? 'Announcement approved and queued for delivery.' : `Draft created: ${id}`);
      setContent('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Announcement could not be created.');
    } finally {
      setBusy(false);
    }
  }

  const ready = Boolean(content.trim() && platforms.length);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Broadcasting</p>
          <h1>New announcement</h1>
          <p className="muted page-subtitle">Create a draft first or explicitly approve a message for delivery to the selected communities.</p>
        </div>
        <span className="status-pill neutral">Human approval</span>
      </header>

      <div className="composer-layout">
        <section className="panel announcement-form">
          <form>
            <label>
              Message
              <textarea required maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write the announcement…" />
              <small className="helper">{content.length.toLocaleString()} / 4,000 characters</small>
            </label>

            <fieldset>
              <legend>Audience</legend>
              <label className="choice"><input type="radio" checked={destination === 'GENERAL'} onChange={() => setDestination('GENERAL')} /> General community</label>
              <label className="choice"><input type="radio" checked={destination === 'APPROVED'} onChange={() => setDestination('APPROVED')} /> Approved members</label>
            </fieldset>

            <fieldset>
              <legend>Platforms</legend>
              {allPlatforms.map((platform) => (
                <label className="choice" key={platform}>
                  <input type="checkbox" checked={platforms.includes(platform)} onChange={() => toggle(platform)} />
                  <span className={`platform ${platform}`}>{platform}</span>
                </label>
              ))}
            </fieldset>

            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}

            <div className="decision-actions">
              <button type="button" disabled={busy || !ready} onClick={(event) => submit(event, false)}>Save draft</button>
              <button type="button" className="primary" disabled={busy || !ready} onClick={(event) => submit(event, true)}>{busy ? 'Working…' : 'Approve & queue'}</button>
            </div>
          </form>
        </section>

        <aside className="panel composer-summary">
          <p className="eyebrow">Delivery summary</p>
          <h2>Before you queue</h2>
          <dl>
            <div><dt>Audience</dt><dd>{destination === 'GENERAL' ? 'General community' : 'Approved members'}</dd></div>
            <div><dt>Platforms</dt><dd>{platforms.length ? platforms.join(', ') : 'None selected'}</dd></div>
            <div><dt>Status</dt><dd>{ready ? 'Ready for action' : 'Incomplete'}</dd></div>
          </dl>
          <div className="delivery-note"><strong>Delivery safety</strong><p>Queueing does not mark a message delivered. Supabase records success only after the selected platform confirms the send.</p></div>
        </aside>
      </div>
    </>
  );
}
