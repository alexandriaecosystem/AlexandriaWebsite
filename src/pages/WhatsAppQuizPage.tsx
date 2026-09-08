import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../services/supabase';
import {
  loadWhatsappQuizAdmin,
  pauseWhatsappQuiz,
  saveWhatsappQuizSchedule,
  sendWhatsappQuizNow,
  type QuizFrequency,
  type WhatsAppQuizAdminData,
  type WhatsAppQuizTarget,
} from '../services/whatsapp-quiz';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import './WhatsAppQuizPage.css';

const DAYS = [
  { value: 1, en: 'Monday', ar: 'الاثنين' },
  { value: 2, en: 'Tuesday', ar: 'الثلاثاء' },
  { value: 3, en: 'Wednesday', ar: 'الأربعاء' },
  { value: 4, en: 'Thursday', ar: 'الخميس' },
  { value: 5, en: 'Friday', ar: 'الجمعة' },
  { value: 6, en: 'Saturday', ar: 'السبت' },
  { value: 7, en: 'Sunday', ar: 'الأحد' },
] as const;

function formatDate(value: string | null, locale: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function friendlyFrequency(frequency: QuizFrequency, days: number[], tr: (en: string, ar: string) => string): string {
  if (frequency === 'daily') return tr('Daily', 'يوميًا');
  const labels = DAYS.filter((day) => days.includes(day.value)).map((day) => tr(day.en, day.ar));
  if (frequency === 'weekly') return labels[0] ?? tr('Weekly', 'أسبوعيًا');
  return labels.length ? labels.join(', ') : tr('Custom', 'مخصص');
}

function preferredQuizTarget(targets: WhatsAppQuizTarget[]): WhatsAppQuizTarget | undefined {
  return targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL' && /general/i.test(target.name) && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL' && !/announcement/i.test(target.name))
    ?? targets.find((target) => target.communityLevel.toUpperCase() === 'GENERAL')
    ?? targets[0];
}

export function WhatsAppQuizPage() {
  const { tr, isArabic } = useLanguage();
  const [data, setData] = useState<WhatsAppQuizAdminData | null>(null);
  const [targets, setTargets] = useState<WhatsAppQuizTarget[]>([]);
  const [communityId, setCommunityId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<QuizFrequency>('daily');
  const [timeOfDay, setTimeOfDay] = useState('19:00');
  const [weeklyDay, setWeeklyDay] = useState(5);
  const [customDays, setCustomDays] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  const locale = isArabic ? 'ar-LB' : undefined;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadWhatsappQuizAdmin(getSupabaseClient())
      .then((next) => {
        if (!active) return;
        setData(next);
        setTargets(next.targets);
        const preferred = next.schedule.communityId
          || preferredQuizTarget(next.targets)?.communityId
          || '';
        setCommunityId(preferred);
        setEnabled(next.schedule.enabled);
        setFrequency(next.schedule.frequency);
        setTimeOfDay(next.schedule.timeOfDay || '19:00');
        if (next.schedule.frequency === 'weekly' && next.schedule.daysOfWeek[0]) setWeeklyDay(next.schedule.daysOfWeek[0]);
        setCustomDays(next.schedule.frequency === 'custom' ? next.schedule.daysOfWeek : []);
      })
      .catch(() => { if (active) setError(tr('Could not load the WhatsApp Quiz settings.', 'تعذر تحميل إعدادات اختبار WhatsApp.')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, tr]);

  const selectedDays = useMemo(() => {
    if (frequency === 'weekly') return [weeklyDay];
    if (frequency === 'custom') return [...customDays].sort((a, b) => a - b);
    return [];
  }, [customDays, frequency, weeklyDay]);

  async function perform(action: () => Promise<unknown>, success: string) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      setReload((value) => value + 1);
    } catch {
      setError(tr('The quiz settings could not be updated. Please try again.', 'تعذر تحديث إعدادات الاختبار. حاول مرة أخرى.'));
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!communityId) {
      setError(tr('Choose a WhatsApp community.', 'اختر مجتمع WhatsApp.'));
      return;
    }
    if (frequency === 'custom' && !customDays.length) {
      setError(tr('Choose at least one day for a custom schedule.', 'اختر يومًا واحدًا على الأقل للجدول المخصص.'));
      return;
    }
    await perform(
      () => saveWhatsappQuizSchedule(getSupabaseClient(), {
        enabled,
        communityId,
        frequency,
        timeOfDay,
        timezone: 'Asia/Beirut',
        daysOfWeek: selectedDays,
      }),
      tr('Quiz schedule saved.', 'تم حفظ جدول الاختبار.'),
    );
  }

  function toggleCustomDay(day: number) {
    setCustomDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);
  }

  if (loading && !data) return <><header className="page-header"><div><h1>{tr('WhatsApp Quiz', 'اختبار WhatsApp')}</h1></div></header><LoadingState label={tr('Loading quiz settings', 'جارٍ تحميل إعدادات الاختبار')} /></>;
  if (error && !data) return <><header className="page-header"><div><h1>{tr('WhatsApp Quiz', 'اختبار WhatsApp')}</h1></div></header><RetryableErrorState onRetry={() => setReload((value) => value + 1)} /></>;

  const schedule = data?.schedule;
  const statusActive = schedule?.enabled === true && schedule.status !== 'ERROR';
  const selectedTarget = targets.find((target) => target.communityId === communityId);

  return <>
    <header className="page-header quiz-page-header">
      <div>
        <p className="eyebrow">{tr('Community qualification', 'تأهيل المجتمع')}</p>
        <h1>{tr('WhatsApp Quiz', 'اختبار WhatsApp')}</h1>
        <p className="muted page-subtitle">{tr('Choose when Alexandria sends the 10-question community quiz. Scoring and access rules stay automatic.', 'اختر متى ترسل Alexandria اختبار المجتمع المكوّن من 10 أسئلة. تبقى قواعد التصحيح والدخول تلقائية.')}</p>
      </div>
      <span className={`status-pill ${statusActive ? 'positive' : schedule?.status === 'ERROR' ? 'negative' : 'neutral'}`}>
        {schedule?.status === 'ERROR' ? tr('Needs attention', 'يحتاج إلى متابعة') : statusActive ? tr('Automatic Quiz: Active', 'الاختبار التلقائي: نشط') : tr('Automatic Quiz: Paused', 'الاختبار التلقائي: متوقف')}
      </span>
    </header>

    {schedule?.lastError && <div className="quiz-friendly-error" role="alert">{schedule.lastError}</div>}
    {error && data && <div className="form-error" role="alert">{error}</div>}
    {notice && <div className="form-success" role="status">{notice}</div>}

    <div className="quiz-layout">
      <form className="panel quiz-schedule-card" onSubmit={save}>
        <div className="section-heading quiz-section-heading">
          <div><p className="eyebrow">{tr('Automatic Quiz', 'الاختبار التلقائي')}</p><h2>{tr('Schedule', 'الجدول')}</h2></div>
          <label className="quiz-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span aria-hidden="true" />
            <strong>{enabled ? tr('ON', 'تشغيل') : tr('OFF', 'إيقاف')}</strong>
          </label>
        </div>

        <div className="quiz-form-grid">
          <label>
            <span>{tr('Community', 'المجتمع')}</span>
            <select aria-label="Community" value={communityId} onChange={(event) => setCommunityId(event.target.value)} disabled={!targets.length}>
              {!targets.length && <option value="">{tr('No WhatsApp community available', 'لا يوجد مجتمع WhatsApp متاح')}</option>}
              {targets.map((target) => <option key={target.communityId} value={target.communityId}>{target.name}</option>)}
            </select>
          </label>

          <label>
            <span>{tr('Frequency', 'التكرار')}</span>
            <select aria-label="Frequency" value={frequency} onChange={(event) => setFrequency(event.target.value as QuizFrequency)}>
              <option value="daily">{tr('Daily', 'يومي')}</option>
              <option value="weekly">{tr('Weekly', 'أسبوعي')}</option>
              <option value="custom">{tr('Custom', 'مخصص')}</option>
            </select>
          </label>

          {frequency === 'weekly' && <label>
            <span>{tr('Day', 'اليوم')}</span>
            <select aria-label="Day" value={weeklyDay} onChange={(event) => setWeeklyDay(Number(event.target.value))}>
              {DAYS.map((day) => <option key={day.value} value={day.value}>{tr(day.en, day.ar)}</option>)}
            </select>
          </label>}

          <label>
            <span>{tr('Time', 'الوقت')}</span>
            <input aria-label="Time" type="time" value={timeOfDay} onChange={(event) => setTimeOfDay(event.target.value)} required />
          </label>
        </div>

        {frequency === 'custom' && <fieldset className="quiz-days">
          <legend>{tr('Days', 'الأيام')}</legend>
          <div>{DAYS.map((day) => <label key={day.value}><input aria-label={day.en} type="checkbox" checked={customDays.includes(day.value)} onChange={() => toggleCustomDay(day.value)} /><span>{tr(day.en.slice(0, 3), day.ar)}</span></label>)}</div>
        </fieldset>}

        <div className="quiz-fixed-info">
          <div><span>{tr('Timezone', 'المنطقة الزمنية')}</span><strong>Asia/Beirut</strong></div>
          <div><span>{tr('Questions', 'الأسئلة')}</span><strong>{tr('10 questions per quiz', '10 أسئلة لكل اختبار')}</strong></div>
        </div>

        <div className="quiz-actions">
          <button type="submit" className="primary-button" disabled={saving || !communityId}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save Schedule', 'حفظ الجدول')}</button>
          <button type="button" className="secondary-button" disabled={saving || !communityId} onClick={() => void perform(() => sendWhatsappQuizNow(getSupabaseClient(), communityId), tr('The 10-question quiz was queued to send now.', 'تم وضع اختبار الـ10 أسئلة في قائمة الإرسال الآن.'))}>{tr('Send 10 Questions Now', 'إرسال 10 أسئلة الآن')}</button>
          <button type="button" className="secondary-button" disabled={saving || !schedule?.enabled} onClick={() => void perform(() => pauseWhatsappQuiz(getSupabaseClient()), tr('Automatic Quiz paused.', 'تم إيقاف الاختبار التلقائي.'))}>{tr('Pause Automatic Quiz', 'إيقاف الاختبار التلقائي')}</button>
        </div>
      </form>

      <aside className="panel quiz-status-card" aria-label={tr('Quiz status', 'حالة الاختبار')}>
        <p className="eyebrow">{tr('Status', 'الحالة')}</p>
        <h2>{schedule?.enabled ? tr('Automatic Quiz is active', 'الاختبار التلقائي نشط') : tr('Automatic Quiz is paused', 'الاختبار التلقائي متوقف')}</h2>
        <dl>
          <div><dt>{tr('Community', 'المجتمع')}</dt><dd>{schedule?.communityName || selectedTarget?.name || '—'}</dd></div>
          <div><dt>{tr('Frequency', 'التكرار')}</dt><dd>{friendlyFrequency(schedule?.frequency ?? frequency, schedule?.daysOfWeek ?? selectedDays, tr)}</dd></div>
          <div><dt>{tr('Time', 'الوقت')}</dt><dd>{schedule?.timeOfDay || timeOfDay}</dd></div>
          <div><dt>{tr('Last sent', 'آخر إرسال')}</dt><dd>{formatDate(schedule?.lastRunAt ?? null, locale)}</dd></div>
          <div><dt>{tr('Next scheduled quiz', 'الاختبار المجدول التالي')}</dt><dd>{schedule?.enabled ? formatDate(schedule.nextRunAt, locale) : '—'}</dd></div>
        </dl>
        <p className="quiz-rule-note">{tr('Qualification stays unchanged: exactly 10 questions are sent and only 10/10 creates the Approved Community access request.', 'يبقى التأهيل دون تغيير: يتم إرسال 10 أسئلة بالضبط، وفقط نتيجة 10/10 تنشئ طلب دخول المجتمع المعتمد.')}</p>
      </aside>
    </div>
  </>;
}
