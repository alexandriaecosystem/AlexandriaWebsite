import { useEffect, useState } from 'react';
import { approveAnnouncement, createAnnouncement } from '../services/admin';
import { listAnnouncementHistory, type AnnouncementHistoryItem } from '../services/admin-operations';
import { getSupabaseClient } from '../services/supabase';
import type { MessagingPlatform } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

const allPlatforms: MessagingPlatform[] = ['telegram', 'discord', 'whatsapp'];
type AnnouncementAudience = 'GENERAL' | 'APPROVED' | 'BOTH';
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

export function AnnouncementsPage() {
  const { tr } = useLanguage();
  const [content, setContent] = useState('');
  const [destination, setDestination] = useState<AnnouncementAudience>('GENERAL');
  const [platforms, setPlatforms] = useState<MessagingPlatform[]>(['telegram']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    void listAnnouncementHistory(getSupabaseClient()).then(setHistory).catch(() => undefined);
  }, [reload]);

  function toggle(platform: MessagingPlatform) {
    setPlatforms((selected) => selected.includes(platform)
      ? selected.filter((item) => item !== platform)
      : [...selected, platform]);
  }

  async function submit(approve: boolean) {
    if (busy || !content.trim() || !platforms.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const id = await createAnnouncement(getSupabaseClient(), { content: content.trim(), destination, platforms });
      if (approve) await approveAnnouncement(getSupabaseClient(), id);
      setMessage(approve ? tr('Announcement approved and queued for delivery.', 'تم اعتماد الإعلان ووضعه في قائمة الإرسال.') : tr(`Draft created: ${id}`, `تم إنشاء المسودة: ${id}`));
      setContent('');
      setReload((n) => n + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Announcement could not be created.', 'تعذر إنشاء الإعلان.'));
    } finally { setBusy(false); }
  }

  const ready = Boolean(content.trim() && platforms.length);
  const audienceLabel = destination === 'GENERAL'
    ? tr('General community', 'المجتمع العام')
    : destination === 'APPROVED'
      ? tr('Approved members', 'الأعضاء المقبولون')
      : tr('General community + Approved members', 'المجتمع العام + الأعضاء المقبولون');

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{tr('Broadcasting', 'البث')}</p><h1>{tr('Announcements', 'الإعلانات')}</h1><p className="muted page-subtitle">{tr('Create messages for the selected communities and review delivery history from the same admin page.', 'أنشئ رسائل للمجتمعات المحددة وراجع سجل الإرسال من نفس صفحة الإدارة.')}</p></div><span className="status-pill neutral">{tr('Human approval', 'اعتماد يدوي')}</span></header>

      <div className="composer-layout">
        <section className="panel announcement-form">
          <form onSubmit={(event) => event.preventDefault()}>
            <p className="eyebrow">{tr('New message', 'رسالة جديدة')}</p><h2>{tr('Compose announcement', 'إنشاء إعلان')}</h2>
            <label>{tr('Message', 'الرسالة')}<textarea required maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tr('Write the announcement…', 'اكتب الإعلان…')} /><small className="helper">{content.length.toLocaleString()} / 4,000 {tr('characters', 'حرف')}</small></label>
            <fieldset><legend>{tr('Audience', 'الجمهور')}</legend><label className="choice"><input type="radio" name="announcement-audience" checked={destination === 'GENERAL'} onChange={() => setDestination('GENERAL')} /> {tr('General community', 'المجتمع العام')}</label><label className="choice"><input type="radio" name="announcement-audience" checked={destination === 'APPROVED'} onChange={() => setDestination('APPROVED')} /> {tr('Approved members', 'الأعضاء المقبولون')}</label><label className="choice"><input type="radio" name="announcement-audience" checked={destination === 'BOTH'} onChange={() => setDestination('BOTH')} /> {tr('Both groups', 'المجموعتان')}</label></fieldset>
            <fieldset><legend>{tr('Platforms', 'المنصات')}</legend>{allPlatforms.map((platform) => <label className="choice" key={platform}><input type="checkbox" checked={platforms.includes(platform)} onChange={() => toggle(platform)} /><span className={`platform ${platform}`} dir="ltr">{platform}</span></label>)}</fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
            <div className="decision-actions"><button type="button" disabled={busy || !ready} onClick={() => void submit(false)}>{tr('Save draft', 'حفظ كمسودة')}</button><button type="button" className="primary" disabled={busy || !ready} onClick={() => void submit(true)}>{busy ? tr('Working…', 'جارٍ التنفيذ…') : tr('Approve & queue', 'اعتماد وإرسال')}</button></div>
          </form>
        </section>

        <aside className="panel composer-summary"><p className="eyebrow">{tr('Delivery summary', 'ملخص الإرسال')}</p><h2>{tr('Before you queue', 'قبل الإرسال')}</h2><dl><div><dt>{tr('Audience', 'الجمهور')}</dt><dd>{audienceLabel}</dd></div><div><dt>{tr('Platforms', 'المنصات')}</dt><dd dir="ltr">{platforms.length ? platforms.join(', ') : tr('None selected', 'لا شيء محدد')}</dd></div><div><dt>{tr('Status', 'الحالة')}</dt><dd>{ready ? tr('Ready for action', 'جاهز للتنفيذ') : tr('Incomplete', 'غير مكتمل')}</dd></div></dl><div className="delivery-note"><strong>{tr('Delivery safety', 'سلامة الإرسال')}</strong><p>{tr('Queueing does not mark a message delivered. Supabase records success only after the selected platform confirms the send.', 'وضع الرسالة في قائمة الإرسال لا يعني أنها وصلت. يسجل Supabase النجاح فقط بعد تأكيد المنصة المحددة لعملية الإرسال.')}</p></div></aside>
      </div>

      <section className="table-card announcement-history-card">
        <div className="section-heading history-heading"><div><p className="eyebrow">{tr('History', 'السجل')}</p><h2>{tr('Announcement delivery history', 'سجل إرسال الإعلانات')}</h2></div><span className="status-pill neutral">{history.length}</span></div>
        <div className="table-scroll"><table><thead><tr><th>{tr('Message', 'الرسالة')}</th><th>{tr('Audience', 'الجمهور')}</th><th>{tr('Platforms', 'المنصات')}</th><th>{tr('Status', 'الحالة')}</th><th>{tr('Delivery', 'الإرسال')}</th><th>{tr('Created', 'الإنشاء')}</th></tr></thead><tbody>
          {history.map((item) => <tr key={item.id}><td className="announcement-text-cell"><strong>{item.content}</strong></td><td>{item.destinationLevel}</td><td><div className="user-platforms">{item.selectedPlatforms.map((platform) => <span key={platform} className={`platform ${platform}`}>{platform}</span>)}</div></td><td><span className={`status-pill ${item.status === 'PUBLISHED' ? 'positive' : item.status === 'FAILED' ? 'negative' : 'neutral'}`}>{item.status}</span></td><td><strong>{item.sentCount}/{item.deliveryCount}</strong>{item.failedCount > 0 && <small className="table-subtext error-text">{item.failedCount} {tr('failed', 'فشل')}</small>}</td><td>{formatDate(item.createdAt)}</td></tr>)}
          {!history.length && <tr><td colSpan={6} className="empty-row">{tr('No announcements yet.', 'لا توجد إعلانات بعد.')}</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
