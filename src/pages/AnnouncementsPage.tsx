import { useEffect, useState } from 'react';
import { approveAnnouncement, createAnnouncement } from '../services/admin';
import { listAnnouncementHistory, type AnnouncementHistoryItem } from '../services/admin-operations';
import { getSupabaseClient } from '../services/supabase';
import type { MessagingPlatform } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

const allPlatforms: MessagingPlatform[] = ['telegram', 'discord', 'whatsapp'];
type AnnouncementAudience = 'GENERAL' | 'APPROVED' | 'BOTH';
type SelectableAudience = Exclude<AnnouncementAudience, 'BOTH'>;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

export function AnnouncementsPage() {
  const { tr } = useLanguage();
  const [content, setContent] = useState('');
  const [audiences, setAudiences] = useState<SelectableAudience[]>(['GENERAL']);
  const [platforms, setPlatforms] = useState<MessagingPlatform[]>(['telegram']);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([]);
  const [reload, setReload] = useState(0);

  useEffect(() => { void listAnnouncementHistory(getSupabaseClient()).then(setHistory).catch(() => undefined); }, [reload]);

  function togglePlatform(platform: MessagingPlatform) {
    setPlatforms((selected) => selected.includes(platform) ? selected.filter((item) => item !== platform) : [...selected, platform]);
  }

  function toggleAudience(audience: SelectableAudience) {
    setAudiences((selected) => selected.includes(audience) ? selected.filter((item) => item !== audience) : [...selected, audience]);
  }

  const destination: AnnouncementAudience = audiences.length === 2 ? 'BOTH' : audiences[0] ?? 'GENERAL';
  const audienceLabel = audiences.length === 0
    ? tr('None selected', 'لا شيء محدد')
    : audiences.length === 2
      ? tr('General community + Approved members', 'المجتمع العام + الأعضاء المقبولون')
      : audiences[0] === 'GENERAL'
        ? tr('General community', 'المجتمع العام')
        : tr('Approved members', 'الأعضاء المقبولون');

  async function submit(approve: boolean) {
    if (busy || !content.trim() || !audiences.length || !platforms.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const id = await createAnnouncement(getSupabaseClient(), { content: content.trim(), destination, platforms });
      if (approve) await approveAnnouncement(getSupabaseClient(), id);
      setMessage(approve ? tr('Announcement approved and queued for delivery.', 'تم اعتماد الإعلان ووضعه في قائمة الإرسال.') : tr('Draft saved.', 'تم حفظ المسودة.'));
      setContent('');
      setReload((n) => n + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Announcement could not be created.', 'تعذر إنشاء الإعلان.'));
    } finally { setBusy(false); }
  }

  function confirmAndQueue() {
    if (!content.trim() || !audiences.length || !platforms.length || busy) return;
    const confirmed = window.confirm([
      tr('Queue this announcement for delivery?', 'هل تريد وضع هذا الإعلان في قائمة الإرسال؟'),
      '',
      `${tr('Audience', 'الجمهور')}: ${audienceLabel}`,
      `${tr('Platforms', 'المنصات')}: ${platforms.join(', ')}`,
      '',
      tr('The selected communities will receive this message after the delivery workers process the queue.', 'ستتلقى المجتمعات المحددة هذه الرسالة بعد أن تعالج خدمات الإرسال قائمة الانتظار.'),
    ].join('\n'));
    if (confirmed) void submit(true);
  }

  const ready = Boolean(content.trim() && audiences.length && platforms.length);

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{tr('Broadcasting', 'البث')}</p><h1>{tr('Announcements', 'الإعلانات')}</h1><p className="muted page-subtitle">{tr('Create messages for the selected communities and review delivery history from the same admin page.', 'أنشئ رسائل للمجتمعات المحددة وراجع سجل الإرسال من نفس صفحة الإدارة.')}</p></div><span className="status-pill neutral">{tr('Human approval', 'اعتماد يدوي')}</span></header>

      <div className="composer-layout">
        <section className="panel announcement-form">
          <form onSubmit={(event) => event.preventDefault()}>
            <p className="eyebrow">{tr('New message', 'رسالة جديدة')}</p><h2>{tr('Compose announcement', 'إنشاء إعلان')}</h2>
            <label>{tr('Message', 'الرسالة')}<textarea required maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tr('Write the announcement…', 'اكتب الإعلان…')} /><small className="helper">{content.length.toLocaleString()} / 4,000 {tr('characters', 'حرف')}</small></label>
            <fieldset><legend>{tr('Audience', 'الجمهور')}</legend><label className="choice"><input type="checkbox" checked={audiences.includes('GENERAL')} onChange={() => toggleAudience('GENERAL')} /> {tr('General community', 'المجتمع العام')}</label><label className="choice"><input type="checkbox" checked={audiences.includes('APPROVED')} onChange={() => toggleAudience('APPROVED')} /> {tr('Approved members', 'الأعضاء المقبولون')}</label></fieldset>
            <fieldset><legend>{tr('Platforms', 'المنصات')}</legend>{allPlatforms.map((platform) => <label className="choice" key={platform}><input type="checkbox" checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} /><span className={`platform ${platform}`} dir="ltr">{platform}</span></label>)}</fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
            <div className="decision-actions"><button type="button" disabled={busy || !ready} onClick={() => void submit(false)}>{tr('Save draft', 'حفظ كمسودة')}</button><button type="button" className="primary" disabled={busy || !ready} onClick={confirmAndQueue}>{busy ? tr('Working…', 'جارٍ التنفيذ…') : tr('Review & queue', 'مراجعة وإرسال')}</button></div>
          </form>
        </section>

        <aside className="panel composer-summary"><p className="eyebrow">{tr('Delivery summary', 'ملخص الإرسال')}</p><h2>{tr('Before you queue', 'قبل الإرسال')}</h2><dl><div><dt>{tr('Audience', 'الجمهور')}</dt><dd>{audienceLabel}</dd></div><div><dt>{tr('Platforms', 'المنصات')}</dt><dd dir="ltr">{platforms.length ? platforms.join(', ') : tr('None selected', 'لا شيء محدد')}</dd></div><div><dt>{tr('Status', 'الحالة')}</dt><dd>{ready ? tr('Ready for review', 'جاهز للمراجعة') : tr('Incomplete', 'غير مكتمل')}</dd></div></dl><div className="delivery-note"><strong>{tr('Delivery safety', 'سلامة الإرسال')}</strong><p>{tr('A final confirmation shows the audience and platforms before the announcement is queued.', 'يظهر تأكيد نهائي للجمهور والمنصات قبل وضع الإعلان في قائمة الإرسال.')}</p></div></aside>
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
