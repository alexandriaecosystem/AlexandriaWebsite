import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../services/supabase';
import {
  getAdminUiSettings,
  updateAdminUiSettings,
  type AdminUiSettings,
  type AnnouncementAudience,
} from '../services/admin-settings';
import type { MessagingPlatform } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import '../admin-settings.css';

const allPlatforms: MessagingPlatform[] = ['telegram', 'discord', 'whatsapp'];
const refreshOptions: AdminUiSettings['tokenAutoRefreshSeconds'][] = [0, 30, 60, 120, 300];

export function AdminSettingsPage() {
  const { tr } = useLanguage();
  const [settings, setSettings] = useState<AdminUiSettings>();
  const [savedSettings, setSavedSettings] = useState<AdminUiSettings>();
  const [loadingError, setLoadingError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoadingError(false);
    getAdminUiSettings(getSupabaseClient())
      .then((value) => {
        setSettings(value);
        setSavedSettings(value);
      })
      .catch(() => setLoadingError(true));
  }, [reload]);

  if (loadingError) {
    return <RetryableErrorState onRetry={() => setReload((value) => value + 1)} />;
  }

  if (!settings) return <LoadingState label={tr('Loading admin settings', 'جارٍ تحميل إعدادات الإدارة')} />;

  const changed = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  function togglePlatform(platform: MessagingPlatform) {
    setSettings((current) => {
      if (!current) return current;
      const selected = current.announcementDefaultPlatforms.includes(platform)
        ? current.announcementDefaultPlatforms.filter((item) => item !== platform)
        : [...current.announcementDefaultPlatforms, platform];
      return selected.length ? { ...current, announcementDefaultPlatforms: selected } : current;
    });
  }

  async function save() {
    const currentSettings = settings;
    if (!currentSettings || !changed || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const saved = await updateAdminUiSettings(getSupabaseClient(), currentSettings);
      setSettings(saved);
      setSavedSettings(saved);
      setMessage(tr('Settings saved.', 'تم حفظ الإعدادات.'));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : tr('Settings could not be saved.', 'تعذر حفظ الإعدادات.'));
    } finally {
      setSaving(false);
    }
  }

  const audienceOptions: { value: AnnouncementAudience; en: string; ar: string }[] = [
    { value: 'GENERAL', en: 'General community', ar: 'المجتمع العام' },
    { value: 'APPROVED', en: 'Approved members', ar: 'الأعضاء المقبولون' },
    { value: 'BOTH', en: 'Both groups', ar: 'المجموعتان' },
  ];

  return <>
    <header className="page-header">
      <div>
        <p className="eyebrow">{tr('Administration', 'الإدارة')}</p>
        <h1>{tr('Settings', 'الإعدادات')}</h1>
        <p className="muted page-subtitle">{tr('Set sensible defaults for announcements and token monitoring. Changes apply to all administrators.', 'حدد الإعدادات الافتراضية للإعلانات ومراقبة التوكن. تنطبق التغييرات على جميع المشرفين.')}</p>
      </div>
      <button type="button" className="primary" disabled={!changed || saving} onClick={() => void save()}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save changes', 'حفظ التغييرات')}</button>
    </header>

    {message && <p className="form-success settings-save-message" role="status">{message}</p>}

    <div className="admin-settings-grid">
      <section className="panel settings-section">
        <div className="settings-section-heading">
          <div><p className="eyebrow">{tr('Announcements', 'الإعلانات')}</p><h2>{tr('Default delivery choices', 'خيارات الإرسال الافتراضية')}</h2></div>
        </div>
        <p className="muted">{tr('These values preselect the announcement composer. An admin can still change them before sending.', 'تظهر هذه القيم محددة مسبقاً عند إنشاء إعلان، ويمكن للمشرف تغييرها قبل الإرسال.')}</p>

        <fieldset className="settings-fieldset">
          <legend>{tr('Default audience', 'الجمهور الافتراضي')}</legend>
          <div className="settings-choice-grid">
            {audienceOptions.map((option) => <label className="settings-choice" key={option.value}>
              <input type="radio" name="default-audience" checked={settings.announcementDefaultAudience === option.value} onChange={() => setSettings({ ...settings, announcementDefaultAudience: option.value })} />
              <span>{tr(option.en, option.ar)}</span>
            </label>)}
          </div>
        </fieldset>

        <fieldset className="settings-fieldset">
          <legend>{tr('Default platforms', 'المنصات الافتراضية')}</legend>
          <div className="settings-choice-grid">
            {allPlatforms.map((platform) => <label className="settings-choice" key={platform}>
              <input type="checkbox" checked={settings.announcementDefaultPlatforms.includes(platform)} onChange={() => togglePlatform(platform)} />
              <span className={`platform ${platform}`} dir="ltr">{platform}</span>
            </label>)}
          </div>
        </fieldset>
      </section>

      <section className="panel settings-section">
        <div className="settings-section-heading">
          <div><p className="eyebrow">{tr('Token activity', 'نشاط التوكن')}</p><h2>{tr('Monitoring preferences', 'تفضيلات المراقبة')}</h2></div>
        </div>
        <p className="muted">{tr('These settings affect the admin token-monitor page only. They do not move tokens or change the smart contract.', 'تؤثر هذه الإعدادات فقط على صفحة مراقبة التوكن ولا تنقل أي توكن أو تعدّل العقد الذكي.')}</p>

        <label className="settings-control">
          <span><strong>{tr('Large transfer threshold', 'حد التحويل الكبير')}</strong><small>{tr('Transfers at or above this amount are highlighted for admins.', 'يتم تمييز التحويلات التي تساوي هذا المبلغ أو تتجاوزه.')}</small></span>
          <input type="number" min="0" step="1" value={settings.tokenLargeTransferThreshold} onChange={(event) => setSettings({ ...settings, tokenLargeTransferThreshold: Math.max(0, Number(event.target.value) || 0) })} dir="ltr" />
        </label>

        <label className="settings-control">
          <span><strong>{tr('Auto refresh', 'التحديث التلقائي')}</strong><small>{tr('How often the token page should request fresh TRONSCAN data while it is open.', 'عدد مرات جلب بيانات جديدة من TRONSCAN أثناء فتح صفحة التوكن.')}</small></span>
          <select value={settings.tokenAutoRefreshSeconds} onChange={(event) => setSettings({ ...settings, tokenAutoRefreshSeconds: Number(event.target.value) as AdminUiSettings['tokenAutoRefreshSeconds'] })}>
            {refreshOptions.map((seconds) => <option key={seconds} value={seconds}>{seconds === 0 ? tr('Off', 'متوقف') : `${seconds} ${tr('seconds', 'ثانية')}`}</option>)}
          </select>
        </label>
      </section>
    </div>

    <section className="panel settings-protection-note">
      <div><strong>{tr('Fixed protections', 'حمايات ثابتة')}</strong><p className="muted">{tr('Member approval remains manual, knowledge must be approved before retrieval, and API secrets stay server-side. These protections are intentionally not configurable here.', 'يبقى قبول الأعضاء يدوياً، ويجب اعتماد المعرفة قبل استخدامها، وتبقى مفاتيح API على الخادم. هذه الحمايات غير قابلة للتغيير من هذه الصفحة عمداً.')}</p></div>
    </section>
  </>;
}
