import { useState, type FormEvent } from 'react';
import { approveAnnouncement, createAnnouncement } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { MessagingPlatform } from '../types/contracts';

export function AnnouncementsPage() {
  const [content, setContent] = useState(''); const [destination, setDestination] = useState<'GENERAL' | 'APPROVED'>('GENERAL');
  const [platforms, setPlatforms] = useState<MessagingPlatform[]>(['telegram']); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  function toggle(platform: MessagingPlatform) { setPlatforms((all) => all.includes(platform) ? all.filter((x) => x !== platform) : [...all, platform]); }
  async function submit(event: FormEvent, approve: boolean) { event.preventDefault(); setBusy(true); setError(''); setMessage(''); try { const id = await createAnnouncement(getSupabaseClient(), { content: content.trim(), destination, platforms }); if (approve) await approveAnnouncement(getSupabaseClient(), id); setMessage(approve ? 'Announcement approved and queued for delivery.' : `Draft created: ${id}`); setContent(''); } catch (e) { setError(e instanceof Error ? e.message : 'Announcement could not be created.'); } finally { setBusy(false); } }
  return <><header className="page-header"><div><p className="eyebrow">Broadcasting</p><h1>New announcement</h1><p className="muted">Create a draft or explicitly approve delivery to configured communities.</p></div></header>
    <section className="panel announcement-form"><form><label>Message<textarea required maxLength={4000} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write the announcement…" /><small>{content.length} / 4000</small></label>
      <fieldset><legend>Audience</legend><label className="choice"><input type="radio" checked={destination === 'GENERAL'} onChange={() => setDestination('GENERAL')} /> General community</label><label className="choice"><input type="radio" checked={destination === 'APPROVED'} onChange={() => setDestination('APPROVED')} /> Approved members</label></fieldset>
      <fieldset><legend>Platforms</legend>{(['telegram', 'discord', 'whatsapp'] as MessagingPlatform[]).map((p) => <label className="choice" key={p}><input type="checkbox" checked={platforms.includes(p)} onChange={() => toggle(p)} /> {p}</label>)}</fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
      <div className="decision-actions"><button disabled={busy || !content.trim() || !platforms.length} onClick={(e) => submit(e, false)}>Save draft</button><button className="primary" disabled={busy || !content.trim() || !platforms.length} onClick={(e) => submit(e, true)}>{busy ? 'Working…' : 'Approve & queue'}</button></div>
    </form></section><section className="panel notice"><strong>Delivery safety</strong><p>Queueing does not mark a message delivered. Supabase records success only after the selected platform confirms the send.</p></section>
  </>;
}
