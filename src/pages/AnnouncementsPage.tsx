import { useEffect, useMemo, useState } from 'react';
import { approveAnnouncement } from '../services/admin';
import {
  listAnnouncementHistory,
  listAnnouncementTargets,
  type AnnouncementHistoryItem,
  type AnnouncementTarget,
} from '../services/admin-operations';
import {
  createAnnouncementWithMedia,
  validateAnnouncementDraft,
  type AnnouncementAudience,
  type AnnouncementPlatform,
} from '../services/announcement-media';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import './AnnouncementsPage.css';
import './AnnouncementsMedia.css';

const allPlatforms: AnnouncementPlatform[] = ['telegram', 'whatsapp', 'discord', 'x', 'instagram'];
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const platformLabel = (platform: string) => platform === 'x' ? 'X' : platform[0]?.toUpperCase() + platform.slice(1);
const platformGlyph: Record<string, string> = {
  telegram: '➤',
  whatsapp: '◉',
  discord: '◆',
  x: '𝕏',
  instagram: '◎',
};

function destinationFromTargets(targets: AnnouncementTarget[]): AnnouncementAudience {
  const levels = new Set(targets.map((target) => target.communityLevel));
  if (levels.size > 1) return 'BOTH';
  return targets[0]?.communityLevel ?? 'GENERAL';
}

export function AnnouncementsPage() {
  const { tr } = useLanguage();
  const [content, setContent] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [targets, setTargets] = useState<AnnouncementTarget[]>([]);
  const [selectedCommunityIds, setSelectedCommunityIds] = useState<string[]>([]);
  const [activePlatform, setActivePlatform] = useState<AnnouncementPlatform>('telegram');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([]);
  const [reload, setReload] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    const client = getSupabaseClient();
    void Promise.all([listAnnouncementTargets(client), listAnnouncementHistory(client)])
      .then(([targetRows, historyRows]) => {
        setTargets(targetRows);
        setHistory(historyRows);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load announcement destinations.', 'تعذر تحميل وجهات الإعلانات.')));
  }, [reload, tr]);

  useEffect(() => {
    if (!image) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  useEffect(() => {
    if (!reviewOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) setReviewOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [reviewOpen, busy]);

  const selectedTargets = useMemo(
    () => targets.filter((target) => selectedCommunityIds.includes(target.id)),
    [targets, selectedCommunityIds],
  );

  const selectedPlatforms = useMemo(
    () => allPlatforms.filter((platform) => selectedTargets.some((target) => target.platform === platform)),
    [selectedTargets],
  );

  const visibleTargets = useMemo(
    () => targets.filter((target) => target.platform === activePlatform),
    [targets, activePlatform],
  );

  const targetCounts = useMemo(() => Object.fromEntries(
    allPlatforms.map((platform) => [platform, targets.filter((target) => target.platform === platform).length]),
  ), [targets]);

  const totalAnnouncements = history.length;
  const totalSent = history.reduce((sum, item) => sum + item.sentCount, 0);
  const totalFailed = history.reduce((sum, item) => sum + item.failedCount, 0);
  const totalDeliveries = history.reduce((sum, item) => sum + item.deliveryCount, 0);
  const successRate = totalDeliveries ? Math.round((totalSent / totalDeliveries) * 100) : 0;
  const lastAnnouncement = history[0] ?? null;

  const hasPostContent = validateAnnouncementDraft(content, image) === null;
  const hasTargets = selectedCommunityIds.length > 0;
  const ready = hasPostContent && hasTargets;

  function toggleTarget(targetId: string) {
    setSelectedCommunityIds((selected) => selected.includes(targetId)
      ? selected.filter((id) => id !== targetId)
      : [...selected, targetId]);
  }

  function selectAllVisible() {
    const visibleIds = visibleTargets.map((target) => target.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedCommunityIds.includes(id));
    setSelectedCommunityIds((selected) => allSelected
      ? selected.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...selected, ...visibleIds])));
  }

  function chooseImage(file: File | null) {
    if (!file) return;
    const validationError = validateAnnouncementDraft(content || 'temporary text', file);
    if (validationError) {
      setError(tr(validationError, validationError === 'Use a JPG, PNG, or WebP image.' ? 'استخدم صورة بصيغة JPG أو PNG أو WebP.' : 'يجب ألا يتجاوز حجم الصورة 5 ميغابايت.'));
      return;
    }
    setError('');
    setImage(file);
  }

  async function submit(approve: boolean) {
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const id = await createAnnouncementWithMedia(getSupabaseClient(), {
        content,
        destination: destinationFromTargets(selectedTargets),
        platforms: selectedPlatforms,
        communityIds: selectedCommunityIds,
        image,
      });
      if (approve) await approveAnnouncement(getSupabaseClient(), id);
      setMessage(approve ? tr('Announcement approved and queued for the selected destinations.', 'تم اعتماد الإعلان ووضعه في قائمة الإرسال للوجهات المحددة.') : tr('Draft saved.', 'تم حفظ المسودة.'));
      setContent('');
      setImage(null);
      setSelectedCommunityIds([]);
      setReviewOpen(false);
      setReload((n) => n + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Announcement could not be created.', 'تعذر إنشاء الإعلان.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header announcements-page-header">
        <div>
          <p className="eyebrow">{tr('Community', 'المجتمع')}</p>
          <h1>{tr('Announcements', 'الإعلانات')}</h1>
          <p className="muted page-subtitle">{tr('Create and send announcements to specific named communities across every connected platform.', 'أنشئ وأرسل الإعلانات إلى مجتمعات محددة بالاسم عبر كل منصة متصلة.')}</p>
        </div>
        <button type="button" className="history-toggle" onClick={() => setHistoryOpen((open) => !open)}>
          ◷ {historyOpen ? tr('Hide history', 'إخفاء السجل') : tr('View history', 'عرض السجل')}
        </button>
      </header>

      <section className="announcement-metrics" aria-label={tr('Announcement summary', 'ملخص الإعلانات')}>
        <article className="announcement-metric-card"><span className="metric-icon gold">◖</span><div><strong>{totalAnnouncements}</strong><span>{tr('Announcements', 'إعلانات')}</span><small>{tr('Total created', 'إجمالي المنشأ')}</small></div></article>
        <article className="announcement-metric-card"><span className="metric-icon green">➤</span><div><strong>{totalSent}</strong><span>{tr('Delivered', 'تم الإرسال')}</span><small>{successRate}% {tr('success rate', 'نسبة نجاح')}</small></div></article>
        <article className="announcement-metric-card"><span className="metric-icon red">!</span><div><strong>{totalFailed}</strong><span>{tr('Failed', 'فشل')}</span><small>{totalDeliveries ? Math.round((totalFailed / totalDeliveries) * 100) : 0}% {tr('failure rate', 'نسبة فشل')}</small></div></article>
        <article className="announcement-metric-card last-announcement-card"><span className="metric-icon neutral">▣</span><div><span>{tr('Last announcement', 'آخر إعلان')}</span><strong className="last-date">{lastAnnouncement ? formatDate(lastAnnouncement.createdAt) : '—'}</strong><small>{lastAnnouncement?.status.replaceAll('_', ' ') ?? tr('No history yet', 'لا يوجد سجل بعد')}</small></div></article>
      </section>

      <div className="announcement-workspace">
        <section className="panel announcement-composer-card">
          <form onSubmit={(event) => event.preventDefault()}>
            <section className={`composer-step ${hasPostContent ? 'complete' : ''}`}>
              <div className="step-heading"><span className="step-number">1</span><div><strong>{tr('Compose your announcement', 'اكتب إعلانك')}</strong><small>{tr('Write the message and optionally attach one image.', 'اكتب الرسالة وأرفق صورة واحدة اختيارياً.')}</small></div></div>
              <label className="message-field">
                <span className="field-label">{tr('Message', 'الرسالة')} <b>*</b></span>
                <textarea maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tr('Write your announcement here…', 'اكتب إعلانك هنا…')} />
                <small className="helper character-count">{content.length.toLocaleString()} / 4,000</small>
              </label>
              <div className="announcement-media-picker">
                {!image && <label className="announcement-media-input compact-media-input"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { chooseImage(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /><span><strong>▧ {tr('Add image', 'إضافة صورة')}</strong><small>{tr('JPG, PNG or WebP · up to 5 MB', 'JPG أو PNG أو WebP · حتى 5 ميغابايت')}</small></span></label>}
                {image && imagePreviewUrl && <div className="selected-announcement-image"><img src={imagePreviewUrl} alt="" /><div className="selected-announcement-image-copy"><strong>{image.name}</strong><small>{formatBytes(image.size)} · {image.type}</small></div><button type="button" className="remove-announcement-image" onClick={() => setImage(null)}>{tr('Remove', 'إزالة')}</button></div>}
              </div>
            </section>

            <section className={`composer-step target-step ${hasTargets ? 'complete' : ''}`}>
              <div className="step-heading"><span className="step-number">2</span><div><strong>{tr('Select target groups', 'اختر المجموعات المستهدفة')}</strong><small>{tr('Choose the exact named communities or public accounts that should receive this post.', 'اختر المجتمعات أو الحسابات العامة المحددة بالاسم التي يجب أن تستلم هذا المنشور.')}</small></div></div>

              <div className="platform-tabs" role="tablist" aria-label={tr('Announcement platforms', 'منصات الإعلان')}>
                {allPlatforms.map((platform) => <button key={platform} type="button" className={activePlatform === platform ? 'active' : ''} onClick={() => setActivePlatform(platform)}><span className={`platform-tab-icon ${platform}`}>{platformGlyph[platform]}</span><span>{platformLabel(platform)}</span><small>{targetCounts[platform] ?? 0}</small></button>)}
              </div>

              <div className="target-list-card">
                <div className="target-list-header"><div><span className={`platform-tab-icon ${activePlatform}`}>{platformGlyph[activePlatform]}</span><strong>{platformLabel(activePlatform)} {activePlatform === 'x' || activePlatform === 'instagram' ? tr('accounts', 'حسابات') : tr('groups', 'مجموعات')}</strong></div><label><input type="checkbox" checked={visibleTargets.length > 0 && visibleTargets.every((target) => selectedCommunityIds.includes(target.id))} onChange={selectAllVisible} /> {tr('Select all', 'تحديد الكل')}</label></div>
                <div className="target-list">
                  {visibleTargets.map((target) => <label className={`target-row ${selectedCommunityIds.includes(target.id) ? 'selected' : ''}`} key={target.id}>
                    <input type="checkbox" checked={selectedCommunityIds.includes(target.id)} onChange={() => toggleTarget(target.id)} />
                    <span className="target-check">✓</span>
                    <span className={`target-avatar ${target.platform}`}>{platformGlyph[target.platform]}</span>
                    <span className="target-copy"><strong>{target.name}</strong><small>{target.targetKind === 'ACCOUNT' ? tr('Public account', 'حساب عام') : target.communityLevel === 'APPROVED' ? tr('Approved community', 'مجتمع معتمد') : tr('General community', 'مجتمع عام')}</small></span>
                    <span className="target-status">● {tr('Active', 'نشط')}</span>
                  </label>)}
                  {!visibleTargets.length && <div className="target-empty">{tr('No active announcement destinations are configured for this platform.', 'لا توجد وجهات إعلان نشطة مهيأة لهذه المنصة.')}</div>}
                </div>
              </div>
            </section>

            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
          </form>
        </section>

        <aside className="announcement-side-column">
          <section className="panel announcement-preview-panel">
            <div className="summary-topline"><div><p className="eyebrow">{tr('Preview', 'معاينة')}</p><h2>{tr('Before you send', 'قبل الإرسال')}</h2></div><span className={`summary-status ${ready ? 'ready' : 'incomplete'}`}>{ready ? tr('Ready', 'جاهز') : tr('Incomplete', 'غير مكتمل')}</span></div>
            <div className="preview-tabs"><span className="active">{tr('Message', 'الرسالة')}</span><span>{tr('Selected groups', 'المجموعات المحددة')}</span></div>
            <div className="announcement-preview social-preview">
              {imagePreviewUrl && <img className="announcement-preview-image" src={imagePreviewUrl} alt="" />}
              <p className={content.trim() ? 'has-content' : ''}>{content.trim() || (image ? tr('Image only', 'صورة فقط') : tr('Your announcement preview will appear here.', 'ستظهر معاينة إعلانك هنا.'))}</p>
              <time>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            <div className="selected-targets-block">
              <div className="selected-targets-heading"><strong>{tr('Selected groups', 'المجموعات المحددة')} ({selectedTargets.length})</strong>{selectedTargets.length > 0 && <button type="button" onClick={() => setSelectedCommunityIds([])}>{tr('Clear all', 'مسح الكل')}</button>}</div>
              <div className="selected-target-list">
                {selectedTargets.map((target) => <div key={target.id}><span className={`target-avatar ${target.platform}`}>{platformGlyph[target.platform]}</span><span><strong>{target.name}</strong><small>{platformLabel(target.platform)}</small></span><button type="button" aria-label={tr('Remove target', 'إزالة الوجهة')} onClick={() => toggleTarget(target.id)}>×</button></div>)}
                {!selectedTargets.length && <p className="summary-empty">{tr('Choose one or more named destinations from the composer.', 'اختر وجهة واحدة أو أكثر بالاسم من أداة الإنشاء.')}</p>}
              </div>
            </div>
          </section>

          <section className="panel announcement-tips"><strong>✦ {tr('Tips for effective announcements', 'نصائح لإعلانات فعالة')}</strong><ul><li>{tr('Keep the message clear and concise.', 'اجعل الرسالة واضحة ومختصرة.')}</li><li>{tr('Choose only the groups relevant to the announcement.', 'اختر فقط المجموعات المناسبة للإعلان.')}</li><li>{tr('Use a relevant image when it improves clarity.', 'استخدم صورة مناسبة عندما تحسن الوضوح.')}</li><li>{tr('Review the selected destinations before queueing.', 'راجع الوجهات المحددة قبل الإرسال.')}</li></ul></section>

          <section className="panel announcement-send-panel"><div><span className="send-icon">➤</span><div><strong>{tr('Send announcement', 'إرسال الإعلان')}</strong><small>{ready ? tr(`${selectedTargets.length} destination${selectedTargets.length === 1 ? '' : 's'} selected`, `تم تحديد ${selectedTargets.length} وجهة`) : tr('Add content and select destinations', 'أضف المحتوى وحدد الوجهات')}</small></div></div><div className="send-actions"><button type="button" disabled={busy || !ready} onClick={() => void submit(false)}>{tr('Save draft', 'حفظ مسودة')}</button><button type="button" className="primary" disabled={busy || !ready} onClick={() => setReviewOpen(true)}>{tr(`Send to ${selectedTargets.length}`, `إرسال إلى ${selectedTargets.length}`)}</button></div></section>
        </aside>
      </div>

      {historyOpen && <section className="table-card announcement-history-card">
        <div className="section-heading history-heading"><div><p className="eyebrow">{tr('History', 'السجل')}</p><h2>{tr('Announcement delivery history', 'سجل إرسال الإعلانات')}</h2></div><span className="status-pill neutral">{history.length}</span></div>
        <div className="table-scroll"><table><thead><tr><th>{tr('Message', 'الرسالة')}</th><th>{tr('Destinations', 'الوجهات')}</th><th>{tr('Status', 'الحالة')}</th><th>{tr('Delivery', 'الإرسال')}</th><th>{tr('Created', 'الإنشاء')}</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td className="announcement-text-cell"><strong>{item.content || tr('Image only', 'صورة فقط')}</strong></td><td><div className="history-destination-list">{item.selectedCommunities.length ? item.selectedCommunities.map((community) => <span key={community.id} className="history-destination-chip"><span className={`platform-tab-icon ${community.platform}`}>{platformGlyph[community.platform]}</span>{community.name}</span>) : item.selectedPlatforms.map((platform) => <span key={platform} className={`platform ${platform}`}>{platform}</span>)}</div></td><td><span className={`status-pill ${item.status === 'PUBLISHED' ? 'positive' : item.status === 'FAILED' ? 'negative' : 'neutral'}`}>{item.status.replaceAll('_', ' ')}</span></td><td><strong>{item.sentCount}/{item.deliveryCount}</strong>{item.failedCount > 0 && <small className="table-subtext error-text">{item.failedCount} {tr('failed', 'فشل')}</small>}</td><td>{formatDate(item.createdAt)}</td></tr>)}{!history.length && <tr><td colSpan={5} className="empty-row">{tr('No announcements yet.', 'لا توجد إعلانات بعد.')}</td></tr>}</tbody></table></div>
      </section>}

      {reviewOpen && <div className="review-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setReviewOpen(false); }}>
        <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-review-title">
          <div className="review-dialog-header"><div><p className="eyebrow">{tr('Final check', 'المراجعة النهائية')}</p><h2 id="announcement-review-title">{tr('Review announcement', 'مراجعة الإعلان')}</h2></div><button type="button" className="dialog-close" aria-label={tr('Close review', 'إغلاق المراجعة')} disabled={busy} onClick={() => setReviewOpen(false)}>×</button></div>
          <p className="review-intro">{tr('Confirm the exact named destinations below. No raw group or channel IDs are shown to administrators.', 'أكد الوجهات المحددة بالاسم أدناه. لا يتم عرض معرفات المجموعات أو القنوات الخام للمشرفين.')}</p>
          <div className="review-target-list">{selectedTargets.map((target) => <div key={target.id}><span className={`target-avatar ${target.platform}`}>{platformGlyph[target.platform]}</span><span><strong>{target.name}</strong><small>{platformLabel(target.platform)} · {target.communityLevel === 'APPROVED' ? tr('Approved', 'معتمد') : tr('General', 'عام')}</small></span></div>)}</div>
          <div className="review-message"><span>{tr('Post', 'المنشور')}</span>{imagePreviewUrl && <img className="review-announcement-image" src={imagePreviewUrl} alt="" />}{content.trim() ? <p>{content.trim()}</p> : <p className="image-only-label">{tr('Image only', 'صورة فقط')}</p>}</div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="review-warning"><strong>{tr('Ready to queue', 'جاهز للإرسال')}</strong><span>{tr('Only these selected destinations will receive this announcement.', 'فقط هذه الوجهات المحددة ستستلم هذا الإعلان.')}</span></div>
          <div className="review-dialog-actions"><button type="button" disabled={busy} onClick={() => setReviewOpen(false)}>{tr('Back to edit', 'العودة للتعديل')}</button><button type="button" className="primary" disabled={busy} onClick={() => void submit(true)}>{busy ? tr('Queueing…', 'جارٍ الإرسال…') : tr(`Confirm & send to ${selectedTargets.length}`, `تأكيد وإرسال إلى ${selectedTargets.length}`)}</button></div>
        </section>
      </div>}
    </>
  );
}
