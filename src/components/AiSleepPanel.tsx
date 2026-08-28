import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../services/supabase';
import {
  cancelAiSleepWindow,
  classifyAiSleepWindow,
  createAiSleepWindow,
  formatSleepDuration,
  formatWakeCountdown,
  listAiSleepWindows,
  validateSleepRange,
  type AiSleepPlatform,
  type AiSleepWindow,
  type AiSleepWindowList,
  type CreateAiSleepWindowInput,
} from '../services/ai-sleep';
import { useLanguage } from '../i18n/LanguageContext';
import '../ai-sleep.css';

type AiSleepPanelProps = {
  now?: Date;
  listWindows?: () => Promise<AiSleepWindowList>;
  createWindow?: (input: CreateAiSleepWindowInput) => Promise<unknown>;
  cancelWindow?: (windowId: string) => Promise<void>;
  onActiveCountChange?: (count: number) => void;
};

type View = 'ACTIVE' | 'UPCOMING' | 'HISTORY';

const platformLabels: Record<AiSleepPlatform, string> = {
  TELEGRAM: 'Telegram',
  DISCORD: 'Discord',
  WHATSAPP: 'WhatsApp',
};

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
}

function platformGlyph(platform: AiSleepPlatform): string {
  if (platform === 'TELEGRAM') return '✈';
  if (platform === 'DISCORD') return '◈';
  return '◉';
}

function localDate(value: string, locale?: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale);
}

export function AiSleepPanel({
  now,
  listWindows,
  createWindow,
  cancelWindow,
  onActiveCountChange,
}: AiSleepPanelProps) {
  const { tr, isArabic } = useLanguage();
  const [windows, setWindows] = useState<AiSleepWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('ACTIVE');
  const [clock, setClock] = useState(now ?? new Date());
  const [platform, setPlatform] = useState<AiSleepPlatform>('TELEGRAM');
  const [channelId, setChannelId] = useState('');
  const [channelName, setChannelName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = listWindows
        ? await listWindows()
        : await listAiSleepWindows(getSupabaseClient(), { limit: 100 });
      setWindows(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not load AI sleep windows.', 'تعذر تحميل فترات إيقاف الذكاء الاصطناعي.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (now) {
      setClock(now);
      return;
    }
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [now]);

  const classified = useMemo(() => windows.map((item) => ({
    ...item,
    status: classifyAiSleepWindow(item, clock),
  })), [windows, clock]);
  const active = classified.filter((item) => item.status === 'ACTIVE');
  const upcoming = classified.filter((item) => item.status === 'UPCOMING');
  const history = classified.filter((item) => item.status === 'ENDED' || item.status === 'CANCELLED');

  useEffect(() => { onActiveCountChange?.(active.length); }, [active.length, onActiveCountChange]);

  const visible = view === 'ACTIVE' ? active : view === 'UPCOMING' ? upcoming : history;
  const locale = isArabic ? 'ar-LB' : undefined;
  let duration = '';
  if (startsAt && endsAt) {
    try {
      const range = validateSleepRange(startsAt, endsAt);
      duration = formatSleepDuration(range.startsAt, range.endsAt);
    } catch {
      duration = '';
    }
  }

  async function handleSchedule(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    const exactChannelId = channelId.trim();
    if (!exactChannelId) {
      setError(tr('Enter the exact channel or group ID.', 'أدخل معرّف القناة أو المجموعة الدقيق.'));
      return;
    }
    try {
      const range = validateSleepRange(startsAt, endsAt);
      const input: CreateAiSleepWindowInput = {
        platform,
        externalChannelId: exactChannelId,
        externalChannelName: channelName.trim() || null,
        startsAt: range.startsAt,
        endsAt: range.endsAt,
        reason: reason.trim() || null,
      };
      setSubmitting(true);
      if (createWindow) await createWindow(input);
      else await createAiSleepWindow(getSupabaseClient(), input);
      setNotice(tr('AI sleep window scheduled.', 'تمت جدولة فترة إيقاف الذكاء الاصطناعي.'));
      setChannelId('');
      setChannelName('');
      setStartsAt('');
      setEndsAt('');
      setReason('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not schedule AI sleep.', 'تعذرت جدولة إيقاف الذكاء الاصطناعي.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function wake(item: AiSleepWindow) {
    setError('');
    setNotice('');
    try {
      setSubmitting(true);
      if (cancelWindow) await cancelWindow(item.id);
      else await cancelAiSleepWindow(getSupabaseClient(), item.id);
      setNotice(tr('AI wake-up recorded. New inbound messages can use AI after the effective wake time.', 'تم تسجيل إعادة تشغيل الذكاء الاصطناعي. يمكن للرسائل الواردة الجديدة استخدام الذكاء الاصطناعي بعد وقت الاستيقاظ الفعلي.'));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not wake the AI.', 'تعذر إعادة تشغيل الذكاء الاصطناعي.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel ai-sleep-panel" aria-label={tr('AI sleep mode', 'وضع إيقاف الذكاء الاصطناعي')}>
      <div className={`ai-sleep-hero ${active.length ? 'sleeping' : 'awake'}`}>
        <div className="ai-sleep-hero-icon" aria-hidden="true">{active.length ? '☾' : '✦'}</div>
        <div>
          <p className="eyebrow">{tr('AI sleep mode', 'وضع إيقاف الذكاء الاصطناعي')}</p>
          <h2>{active.length ? tr('AI Sleeping', 'الذكاء الاصطناعي متوقف') : tr('AI Active', 'الذكاء الاصطناعي نشط')}</h2>
          <p>{active.length
            ? tr('Human takeover active', 'التحكم البشري نشط')
            : tr('No channel is currently paused for human takeover.', 'لا توجد قناة متوقفة حاليًا للتحكم البشري.')}</p>
        </div>
        <span className={`status-pill ${active.length ? 'negative' : 'positive'}`}>
          {active.length ? `${active.length} ${tr('sleeping', 'متوقف')}` : tr('Ready', 'جاهز')}
        </span>
      </div>

      <div className="ai-sleep-layout">
        <form className="ai-sleep-form" onSubmit={handleSchedule}>
          <div className="ai-sleep-form-head">
            <div><p className="eyebrow">{tr('Schedule takeover', 'جدولة التحكم')}</p><h3>{tr('Pause automated replies', 'إيقاف الردود الآلية')}</h3></div>
            <small>{localTimeZone()}</small>
          </div>
          <div className="ai-sleep-fields">
            <label>
              <span>{tr('Platform', 'المنصة')}</span>
              <select aria-label="Sleep platform" value={platform} onChange={(event) => setPlatform(event.target.value as AiSleepPlatform)}>
                <option value="TELEGRAM">Telegram</option>
                <option value="DISCORD">Discord</option>
                <option value="WHATSAPP">WhatsApp</option>
              </select>
            </label>
            <label>
              <span>{tr('Exact channel or group ID', 'معرّف القناة أو المجموعة الدقيق')}</span>
              <input aria-label="Exact channel or group ID" value={channelId} onChange={(event) => setChannelId(event.target.value)} placeholder="-100123456" maxLength={255} />
            </label>
            <label>
              <span>{tr('Channel or group name', 'اسم القناة أو المجموعة')}</span>
              <input aria-label="Channel or group name" value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder={tr('VIP Community', 'مجتمع VIP')} maxLength={160} />
            </label>
            <label>
              <span>{tr('Sleep starts', 'بدء الإيقاف')}</span>
              <input aria-label="Sleep starts" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
            </label>
            <label>
              <span>{tr('AI wakes', 'إعادة تشغيل الذكاء الاصطناعي')}</span>
              <input aria-label="AI wakes" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
            </label>
            <label className="ai-sleep-reason">
              <span>{tr('Reason', 'السبب')}</span>
              <input aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={tr('Admin coverage, event, escalation…', 'تغطية إدارية، حدث، تصعيد…')} maxLength={500} />
            </label>
          </div>
          <div className="ai-sleep-submit-row">
            <span className="ai-sleep-duration">{duration ? `${tr('Duration', 'المدة')}: ${duration}` : tr('Maximum 30 days per window', 'الحد الأقصى 30 يومًا لكل فترة')}</span>
            <button className="primary-button" type="submit" aria-label="Schedule AI sleep" disabled={submitting}>{submitting ? tr('Saving…', 'جارٍ الحفظ…') : tr('Schedule sleep', 'جدولة الإيقاف')}</button>
          </div>
        </form>

        <div className="ai-sleep-operations">
          <div className="ai-sleep-tabs" role="tablist" aria-label={tr('AI sleep windows', 'فترات إيقاف الذكاء الاصطناعي')}>
            <button type="button" className={view === 'ACTIVE' ? 'active' : ''} onClick={() => setView('ACTIVE')}>{tr('Active', 'نشط')} <span>{active.length}</span></button>
            <button type="button" aria-label="Upcoming sleep windows" className={view === 'UPCOMING' ? 'active' : ''} onClick={() => setView('UPCOMING')}>{tr('Upcoming', 'قادم')} <span>{upcoming.length}</span></button>
            <button type="button" aria-label="Sleep history" className={view === 'HISTORY' ? 'active' : ''} onClick={() => setView('HISTORY')}>{tr('History', 'السجل')} <span>{history.length}</span></button>
          </div>

          {loading ? <div className="ai-sleep-empty">{tr('Loading sleep windows…', 'جارٍ تحميل فترات الإيقاف…')}</div> : (
            <div className="ai-sleep-window-list">
              {visible.map((item) => (
                <article className={`ai-sleep-window-card ${item.status.toLowerCase()}`} key={item.id}>
                  <div className="ai-sleep-window-top">
                    <span className={`ai-sleep-platform ${item.platform.toLowerCase()}`}><i aria-hidden="true">{platformGlyph(item.platform)}</i>{platformLabels[item.platform]}</span>
                    <span className={`status-pill ${item.status === 'ACTIVE' ? 'negative' : item.status === 'UPCOMING' ? 'neutral' : 'positive'}`}>{item.status === 'ACTIVE' ? tr('Human takeover', 'تحكم بشري') : item.status}</span>
                  </div>
                  <div className="ai-sleep-window-name">
                    <strong>{item.externalChannelName || tr('Unnamed channel', 'قناة بدون اسم')}</strong>
                    <code>{item.externalChannelId}</code>
                  </div>
                  <div className="ai-sleep-window-time">
                    <span><small>{tr('From', 'من')}</small>{localDate(item.startsAt, locale)}</span>
                    <span><small>{tr('Until', 'حتى')}</small>{localDate(item.endsAt, locale)}</span>
                  </div>
                  {item.status === 'ACTIVE' && <p className="ai-sleep-countdown">☾ {tr('Wakes in', 'يستيقظ خلال')} {formatWakeCountdown(item.endsAt, clock)}</p>}
                  {item.reason && <p className="ai-sleep-card-reason">{item.reason}</p>}
                  {(item.status === 'ACTIVE' || item.status === 'UPCOMING') && (
                    <button type="button" className="secondary-button ai-wake-button" aria-label={`Wake AI now for ${item.externalChannelName || item.externalChannelId}`} disabled={submitting} onClick={() => void wake(item)}>{tr('Wake AI now', 'تشغيل الذكاء الاصطناعي الآن')}</button>
                  )}
                </article>
              ))}
              {!visible.length && <div className="ai-sleep-empty">{view === 'ACTIVE' ? tr('No active human takeovers.', 'لا توجد عمليات تحكم بشري نشطة.') : view === 'UPCOMING' ? tr('No upcoming sleep windows.', 'لا توجد فترات إيقاف قادمة.') : tr('No sleep history yet.', 'لا يوجد سجل إيقاف بعد.')}</div>}
            </div>
          )}
        </div>
      </div>

      {error && <div className="ai-sleep-alert error" role="alert">{error}</div>}
      {notice && <div className="ai-sleep-alert success" role="status">{notice}</div>}
      <div className="ai-sleep-enforcement-note" role="note">
        <strong>{tr('Server enforcement required', 'يلزم تطبيق على الخادم')}</strong>
        <span>{tr('Scheduling stores the takeover rule. Each Telegram, Discord and WhatsApp inbound workflow must call the reply-policy check before AI generation. Incoming messages still stay visible in the inbox.', 'تقوم الجدولة بحفظ قاعدة التحكم. يجب على كل سير عمل وارد في Telegram وDiscord وWhatsApp التحقق من سياسة الرد قبل توليد رد الذكاء الاصطناعي. تبقى الرسائل الواردة ظاهرة في صندوق الوارد.')}</span>
      </div>
    </section>
  );
}
