import { useEffect, useState } from 'react';
import { approveAnnouncement } from '../services/admin';
import { listAnnouncementHistory, type AnnouncementHistoryItem } from '../services/admin-operations';
import {
  createAnnouncementWithMedia,
  validateAnnouncementDraft,
  type AnnouncementPlatform,
} from '../services/announcement-media';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import './AnnouncementsPage.css';
import './AnnouncementsMedia.css';

const allPlatforms: AnnouncementPlatform[] = ['telegram', 'discord', 'whatsapp', 'x'];
type AnnouncementAudience = 'GENERAL' | 'APPROVED' | 'BOTH';
type SelectableAudience = Exclude<AnnouncementAudience, 'BOTH'>;
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const formatBytes = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function AnnouncementsPage() {
  const { tr } = useLanguage();
  const [content, setContent] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<SelectableAudience[]>([]);
  const [platforms, setPlatforms] = useState<AnnouncementPlatform[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<AnnouncementHistoryItem[]>([]);
  const [reload, setReload] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => { void listAnnouncementHistory(getSupabaseClient()).then(setHistory).catch(() => undefined); }, [reload]);

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

  function togglePlatform(platform: AnnouncementPlatform) {
    setPlatforms((selected) => selected.includes(platform) ? selected.filter((item) => item !== platform) : [...selected, platform]);
  }

  function toggleAudience(audience: SelectableAudience) {
    setAudiences((selected) => selected.includes(audience) ? selected.filter((item) => item !== audience) : [...selected, audience]);
  }

  function toggleAllAudiences() {
    setAudiences((selected) => selected.length === 2 ? [] : ['GENERAL', 'APPROVED']);
  }

  function toggleAllPlatforms() {
    setPlatforms((selected) => selected.length === allPlatforms.length ? [] : [...allPlatforms]);
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

  const destination: AnnouncementAudience = audiences.length === 2 ? 'BOTH' : audiences[0] ?? 'GENERAL';
  const audienceLabel = audiences.length === 0
    ? tr('None selected', 'لا شيء محدد')
    : audiences.length === 2
      ? tr('General community + Approved members', 'المجتمع العام + الأعضاء المقبولون')
      : audiences[0] === 'GENERAL'
        ? tr('General community', 'المجتمع العام')
        : tr('Approved members', 'الأعضاء المقبولون');

  const audienceNames = audiences.map((audience) => audience === 'GENERAL'
    ? tr('General community', 'المجتمع العام')
    : tr('Approved members', 'الأعضاء المقبولون'));

  const hasPostContent = validateAnnouncementDraft(content, image) === null;
  const hasAudience = Boolean(audiences.length);
  const hasPlatforms = Boolean(platforms.length);
  const completedSteps = [hasPostContent, hasAudience, hasPlatforms].filter(Boolean).length;
  const ready = completedSteps === 3;

  async function submit(approve: boolean) {
    if (busy || !ready) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const id = await createAnnouncementWithMedia(getSupabaseClient(), {
        content,
        destination,
        platforms,
        image,
      });
      if (approve) await approveAnnouncement(getSupabaseClient(), id);
      setMessage(approve ? tr('Announcement approved and queued for delivery.', 'تم اعتماد الإعلان ووضعه في قائمة الإرسال.') : tr('Draft saved.', 'تم حفظ المسودة.'));
      setContent('');
      setImage(null);
      setAudiences([]);
      setPlatforms([]);
      setReviewOpen(false);
      setReload((n) => n + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Announcement could not be created.', 'تعذر إنشاء الإعلان.'));
    } finally { setBusy(false); }
  }

  function openReview() {
    if (!ready || busy) return;
    setError('');
    setReviewOpen(true);
  }

  return (
    <>
      <header className="page-header"><div><p className="eyebrow">{tr('Broadcasting', 'البث')}</p><h1>{tr('Announcements', 'الإعلانات')}</h1><p className="muted page-subtitle">{tr('Post text, an image, or both, choose who should receive it, then review everything before it is queued.', 'انشر نصاً أو صورة أو كليهما، واختر المستلمين، ثم راجع كل شيء قبل وضعه في قائمة الإرسال.')}</p></div><span className="status-pill neutral">{tr('Human approval', 'اعتماد يدوي')}</span></header>

      <div className="composer-layout">
        <section className="panel announcement-form">
          <form onSubmit={(event) => event.preventDefault()}>
            <div className="composer-title-row"><div><p className="eyebrow">{tr('New post', 'منشور جديد')}</p><h2>{tr('Compose announcement', 'إنشاء إعلان')}</h2></div><span className="composer-progress-copy">{completedSteps}/3 {tr('complete', 'مكتمل')}</span></div>

            <section className={`composer-step ${hasPostContent ? 'complete' : ''}`}>
              <div className="step-heading">
                <span className="step-number">1</span>
                <div><strong>{tr('Add content', 'أضف المحتوى')}</strong><small>{tr('Write text, attach one image, or do both.', 'اكتب نصاً أو أرفق صورة واحدة أو استخدم الاثنين معاً.')}</small></div>
              </div>
              <div className="announcement-content-grid">
                <label className="message-field"><span className="sr-only">{tr('Message', 'الرسالة')}</span><textarea maxLength={4000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={tr('Write an optional caption or announcement…', 'اكتب تعليقاً أو إعلاناً اختيارياً…')} /><small className="helper character-count">{content.length.toLocaleString()} / 4,000</small></label>
                <div className="announcement-media-picker">
                  {!image && <label className="announcement-media-input"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { chooseImage(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /><span><strong>{tr('Attach an image', 'إرفاق صورة')}</strong><small>{tr('JPG, PNG or WebP · up to 5 MB', 'JPG أو PNG أو WebP · حتى 5 ميغابايت')}</small></span></label>}
                  {image && imagePreviewUrl && <div className="selected-announcement-image"><img src={imagePreviewUrl} alt="" /><div className="selected-announcement-image-copy"><strong>{image.name}</strong><small>{formatBytes(image.size)} · {image.type}</small></div><button type="button" className="remove-announcement-image" onClick={() => setImage(null)}>{tr('Remove', 'إزالة')}</button></div>}
                </div>
              </div>
            </section>

            <fieldset className={`composer-step ${hasAudience ? 'complete' : ''}`}>
              <legend className="sr-only">{tr('Audience', 'الجمهور')}</legend>
              <div className="step-heading-row">
                <div className="step-heading"><span className="step-number">2</span><div><strong>{tr('Choose audience', 'اختر الجمهور')}</strong><small>{tr('Select one community or both.', 'اختر مجتمعاً واحداً أو كليهما.')}</small></div></div>
                <button type="button" className="inline-action" onClick={toggleAllAudiences}>{audiences.length === 2 ? tr('Clear', 'مسح') : tr('Select both', 'تحديد الكل')}</button>
              </div>
              <div className="selection-grid">
                <label className={`selection-card ${audiences.includes('GENERAL') ? 'selected' : ''}`}><input type="checkbox" checked={audiences.includes('GENERAL')} onChange={() => toggleAudience('GENERAL')} /><span className="selection-check" aria-hidden="true">✓</span><span className="selection-card-copy"><strong>{tr('General community', 'المجتمع العام')}</strong><small>{tr('Send to the public community audience.', 'إرسال إلى جمهور المجتمع العام.')}</small></span></label>
                <label className={`selection-card ${audiences.includes('APPROVED') ? 'selected' : ''}`}><input type="checkbox" checked={audiences.includes('APPROVED')} onChange={() => toggleAudience('APPROVED')} /><span className="selection-check" aria-hidden="true">✓</span><span className="selection-card-copy"><strong>{tr('Approved members', 'الأعضاء المقبولون')}</strong><small>{tr('Send only to approved community members.', 'إرسال فقط إلى أعضاء المجتمع المقبولين.')}</small></span></label>
              </div>
            </fieldset>

            <fieldset className={`composer-step ${hasPlatforms ? 'complete' : ''}`}>
              <legend className="sr-only">{tr('Platforms', 'المنصات')}</legend>
              <div className="step-heading-row">
                <div className="step-heading"><span className="step-number">3</span><div><strong>{tr('Choose platforms', 'اختر المنصات')}</strong><small>{tr('Select every channel where this announcement should appear.', 'اختر كل قناة يجب أن يظهر فيها هذا الإعلان.')}</small></div></div>
                <button type="button" className="inline-action" onClick={toggleAllPlatforms}>{platforms.length === allPlatforms.length ? tr('Clear', 'مسح') : tr('Select all', 'تحديد الكل')}</button>
              </div>
              <div className="selection-grid platform-selection-grid">
                {allPlatforms.map((platform) => <label className={`selection-card platform-card ${platforms.includes(platform) ? 'selected' : ''}`} key={platform}><input type="checkbox" checked={platforms.includes(platform)} onChange={() => togglePlatform(platform)} /><span className="selection-check" aria-hidden="true">✓</span><span className={`platform ${platform}`} dir="ltr">{platform}</span></label>)}
              </div>
            </fieldset>

            {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
            <div className="decision-actions announcement-actions"><div className="action-readiness"><strong>{ready ? tr('Ready to review', 'جاهز للمراجعة') : tr(`${3 - completedSteps} step${3 - completedSteps === 1 ? '' : 's'} remaining`, `متبقي ${3 - completedSteps}`)}</strong><small>{ready ? tr('Check the final preview before queueing.', 'تحقق من المعاينة النهائية قبل الإرسال.') : tr('Complete the highlighted steps to continue.', 'أكمل الخطوات المتبقية للمتابعة.')}</small></div><div className="action-buttons"><button type="button" disabled={busy || !ready} onClick={() => void submit(false)}>{tr('Save draft', 'حفظ كمسودة')}</button><button type="button" className="primary" disabled={busy || !ready} onClick={openReview}>{tr('Review announcement', 'مراجعة الإعلان')}</button></div></div>
          </form>
        </section>

        <aside className="panel composer-summary">
          <div className="summary-topline"><div><p className="eyebrow">{tr('Delivery summary', 'ملخص الإرسال')}</p><h2>{tr('At a glance', 'نظرة سريعة')}</h2></div><span className={`summary-status ${ready ? 'ready' : 'incomplete'}`}>{ready ? tr('Ready', 'جاهز') : `${completedSteps}/3`}</span></div>
          <div className="summary-progress" aria-label={tr('Completion progress', 'تقدم الإكمال')}><span style={{ width: `${(completedSteps / 3) * 100}%` }} /></div>
          <dl><div><dt>{tr('Audience', 'الجمهور')}</dt><dd>{audienceNames.length ? <span className="summary-value-list">{audienceNames.map((name) => <span className="summary-chip" key={name}>{name}</span>)}</span> : <span className="summary-empty">{tr('Not selected yet', 'لم يتم التحديد بعد')}</span>}</dd></div><div><dt>{tr('Platforms', 'المنصات')}</dt><dd>{platforms.length ? <span className="summary-value-list">{platforms.map((platform) => <span className={`platform ${platform}`} key={platform} dir="ltr">{platform}</span>)}</span> : <span className="summary-empty">{tr('Not selected yet', 'لم يتم التحديد بعد')}</span>}</dd></div></dl>
          <div className="announcement-preview"><small>{tr('Post preview', 'معاينة المنشور')}</small>{imagePreviewUrl && <img className="announcement-preview-image" src={imagePreviewUrl} alt="" />}<p className={content.trim() ? 'has-content' : ''}>{content.trim() || (image ? tr('Image only', 'صورة فقط') : tr('Add text or an image to preview your announcement.', 'أضف نصاً أو صورة لمعاينة الإعلان.'))}</p></div>
          <div className="delivery-note"><strong>{tr('Safe by design', 'إرسال آمن')}</strong><p>{tr('Nothing is queued until you open the review screen and confirm the final audience and platforms.', 'لن يتم وضع أي شيء في قائمة الإرسال حتى تفتح شاشة المراجعة وتؤكد الجمهور والمنصات النهائية.')}</p></div>
        </aside>
      </div>

      <section className="table-card announcement-history-card">
        <div className="section-heading history-heading"><div><p className="eyebrow">{tr('History', 'السجل')}</p><h2>{tr('Announcement delivery history', 'سجل إرسال الإعلانات')}</h2></div><span className="status-pill neutral">{history.length}</span></div>
        <div className="table-scroll"><table><thead><tr><th>{tr('Message', 'الرسالة')}</th><th>{tr('Audience', 'الجمهور')}</th><th>{tr('Platforms', 'المنصات')}</th><th>{tr('Status', 'الحالة')}</th><th>{tr('Delivery', 'الإرسال')}</th><th>{tr('Created', 'الإنشاء')}</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td className="announcement-text-cell"><strong>{item.content || tr('Image only', 'صورة فقط')}</strong></td><td>{item.destinationLevel}</td><td><div className="user-platforms">{item.selectedPlatforms.map((platform) => <span key={platform} className={`platform ${platform}`}>{platform}</span>)}</div></td><td><span className={`status-pill ${item.status === 'PUBLISHED' ? 'positive' : item.status === 'FAILED' ? 'negative' : 'neutral'}`}>{item.status}</span></td><td><strong>{item.sentCount}/{item.deliveryCount}</strong>{item.failedCount > 0 && <small className="table-subtext error-text">{item.failedCount} {tr('failed', 'فشل')}</small>}</td><td>{formatDate(item.createdAt)}</td></tr>)}{!history.length && <tr><td colSpan={6} className="empty-row">{tr('No announcements yet.', 'لا توجد إعلانات بعد.')}</td></tr>}</tbody></table></div>
      </section>

      {reviewOpen && <div className="review-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setReviewOpen(false); }}><section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-review-title"><div className="review-dialog-header"><div><p className="eyebrow">{tr('Final check', 'المراجعة النهائية')}</p><h2 id="announcement-review-title">{tr('Review announcement', 'مراجعة الإعلان')}</h2></div><button type="button" className="dialog-close" aria-label={tr('Close review', 'إغلاق المراجعة')} disabled={busy} onClick={() => setReviewOpen(false)}>×</button></div><p className="review-intro">{tr('Confirm exactly where this post will be delivered before it enters the queue.', 'تأكد من أماكن إرسال هذا المنشور قبل إضافته إلى قائمة الإرسال.')}</p><div className="review-detail-grid"><div><span>{tr('Audience', 'الجمهور')}</span><strong>{audienceLabel}</strong></div><div><span>{tr('Platforms', 'المنصات')}</span><div className="summary-value-list">{platforms.map((platform) => <span className={`platform ${platform}`} key={platform}>{platform}</span>)}</div></div></div><div className="review-message"><span>{tr('Post', 'المنشور')}</span>{imagePreviewUrl && <img className="review-announcement-image" src={imagePreviewUrl} alt="" />}{content.trim() ? <p>{content.trim()}</p> : <p className="image-only-label">{tr('Image only', 'صورة فقط')}</p>}</div>{error && <p className="form-error" role="alert">{error}</p>}<div className="review-warning"><strong>{tr('Ready to queue', 'جاهز للإرسال')}</strong><span>{tr('Delivery workers will process this announcement after confirmation.', 'ستعالج خدمات الإرسال هذا الإعلان بعد التأكيد.')}</span></div><div className="review-dialog-actions"><button type="button" disabled={busy} onClick={() => setReviewOpen(false)}>{tr('Back to edit', 'العودة للتعديل')}</button><button type="button" className="primary" disabled={busy} onClick={() => void submit(true)}>{busy ? tr('Queueing…', 'جارٍ الإرسال…') : tr('Confirm & queue', 'تأكيد وإرسال')}</button></div></section></div>}
    </>
  );
}
