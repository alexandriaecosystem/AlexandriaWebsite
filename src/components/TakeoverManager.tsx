import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../services/supabase';
import {
  cancelAiSleepWindow,
  classifyAiSleepWindow,
  formatSleepDuration,
  listAiSleepWindows,
  validateSleepRange,
  type AiSleepWindow,
  type AiSleepWindowList,
} from '../services/ai-sleep';
import {
  createCommunityTakeover,
  listTakeoverTargets,
  type CreateCommunityTakeoverInput,
  type TakeoverTarget,
} from '../services/takeovers';
import { useLanguage } from '../i18n/LanguageContext';
import '../takeover.css';

type TakeoverMode = 'NOW' | 'SCHEDULE';
type QuickDuration = number | 'TOMORROW' | 'CUSTOM';

type TakeoverManagerProps = {
  now?: Date;
  listTargets?: () => Promise<TakeoverTarget[]>;
  listWindows?: () => Promise<AiSleepWindowList>;
  createWindow?: (input: CreateCommunityTakeoverInput) => Promise<unknown>;
  cancelWindow?: (windowId: string) => Promise<void>;
  onActiveCountChange?: (count: number) => void;
};

const QUICK_DURATIONS: { label: string; value: QuickDuration }[] = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: 'Until tomorrow', value: 'TOMORROW' },
  { label: 'Custom', value: 'CUSTOM' },
];

function localDateTime(value: string, locale?: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function untilTomorrow(base: Date): Date {
  const end = new Date(base);
  end.setDate(end.getDate() + 1);
  end.setHours(9, 0, 0, 0);
  return end;
}

function platformLabel(platform: string): string {
  if (platform === 'WHATSAPP') return 'WhatsApp';
  if (platform === 'DISCORD') return 'Discord';
  return 'Telegram';
}

export function TakeoverManager({
  now,
  listTargets,
  listWindows,
  createWindow,
  cancelWindow,
  onActiveCountChange,
}: TakeoverManagerProps) {
  const { tr, isArabic } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [targets, setTargets] = useState<TakeoverTarget[]>([]);
  const [windows, setWindows] = useState<AiSleepWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(now ?? new Date());
  const [mode, setMode] = useState<TakeoverMode>('SCHEDULE');
  const [communityId, setCommunityId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [customEndsAt, setCustomEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [quickDuration, setQuickDuration] = useState<QuickDuration>(120);

  const load = async () => {
    setLoading(true);
    setLoadFailed(false);
    setError('');
    try {
      const [loadedTargets, loadedWindows] = await Promise.all([
        listTargets ? listTargets() : listTakeoverTargets(getSupabaseClient()),
        listWindows ? listWindows() : listAiSleepWindows(getSupabaseClient(), { limit: 100 }),
      ]);
      setTargets(loadedTargets);
      setWindows(loadedWindows.items);
      setCommunityId((current) => current || loadedTargets[0]?.communityId || '');
    } catch {
      setLoadFailed(true);
      setError(tr('Could not load takeovers. Please retry.', 'تعذر تحميل عمليات التحكم البشري. أعد المحاولة.'));
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
  const nextWindow = active[0] ?? upcoming[0] ?? null;
  const locale = isArabic ? 'ar-LB' : undefined;

  useEffect(() => { if (!loading && !loadFailed) onActiveCountChange?.(active.length); }, [active.length, loading, loadFailed, onActiveCountChange]);

  function chooseMode(nextMode: TakeoverMode) {
    setMode(nextMode);
    setError('');
    setNotice('');
    if (nextMode === 'SCHEDULE' && !startsAt) {
      const base = now ? new Date(now) : new Date();
      const defaultStart = new Date(base.getTime() + 30 * 60_000);
      const defaultEnd = new Date(defaultStart.getTime() + 2 * 60 * 60_000);
      setStartsAt(toLocalInputValue(defaultStart));
      setEndsAt(toLocalInputValue(defaultEnd));
    }
  }

  function openDrawer(nextMode?: TakeoverMode) {
    if (nextMode) chooseMode(nextMode);
    setDrawerOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!communityId) {
      setError(tr('Choose a community or conversation.', 'اختر مجتمعًا أو محادثة.'));
      return;
    }

    try {
      let input: CreateCommunityTakeoverInput;
      if (mode === 'NOW') {
        const base = now ? new Date(now) : new Date();
        let end: Date;
        if (typeof quickDuration === 'number') {
          end = new Date(base.getTime() + quickDuration * 60_000);
        } else if (quickDuration === 'TOMORROW') {
          end = untilTomorrow(base);
        } else {
          const range = validateSleepRange(base.toISOString(), customEndsAt);
          end = new Date(range.endsAt);
        }
        input = {
          communityId,
          startsAt: base.toISOString(),
          endsAt: end.toISOString(),
          reason: reason.trim() || null,
        };
      } else {
        const range = validateSleepRange(startsAt, endsAt);
        input = {
          communityId,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          reason: reason.trim() || null,
        };
      }

      setSubmitting(true);
      if (createWindow) await createWindow(input);
      else await createCommunityTakeover(getSupabaseClient(), input);
      setNotice(mode === 'NOW'
        ? tr('Human takeover started.', 'بدأ التحكم البشري.')
        : tr('Human takeover scheduled.', 'تمت جدولة التحكم البشري.'));
      await load();
    } catch {
      setError(tr('Could not save the takeover. Check the time window and try again.', 'تعذر حفظ التحكم البشري. تحقق من الفترة الزمنية وحاول مجددًا.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function returnToAi(windowId: string) {
    setError('');
    setNotice('');
    try {
      setSubmitting(true);
      if (cancelWindow) await cancelWindow(windowId);
      else await cancelAiSleepWindow(getSupabaseClient(), windowId);
      setNotice(tr('This takeover ended. Any other active takeover still applies.', 'انتهى هذا التحكم البشري. تظل أي فترة تحكم أخرى نشطة سارية.'));
      await load();
    } catch {
      setError(tr('Could not return to AI. Refresh the status and try again.', 'تعذر إعادة التحكم للذكاء الاصطناعي. حدّث الحالة وحاول مجددًا.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="takeover-shell" aria-label={tr('Human Takeover', 'التحكم البشري')}>
      <div className="takeover-toolbar-actions">
        <span className={`status-pill ${loading || loadFailed ? 'neutral' : active.length ? 'negative' : 'positive'}`}>
          <span className="takeover-status-dot" aria-hidden="true" />
          {loading ? tr('Checking reply status…', 'جارٍ التحقق من حالة الردود…') : loadFailed ? tr('Reply status unavailable', 'حالة الردود غير متاحة') : active.length ? tr('Human Takeover Active', 'التحكم البشري نشط') : tr('AI Active', 'الذكاء الاصطناعي نشط')}
        </span>
        <div className="takeover-primary-actions">
          <button type="button" className="primary-button takeover-manage-button" aria-label="Take Over Now" onClick={() => openDrawer('NOW')}>
            {tr('Take Over Now', 'ابدأ التحكم الآن')}
          </button>
          <button type="button" className="secondary-button takeover-manage-button" aria-label="Schedule Takeover" onClick={() => openDrawer('SCHEDULE')}>
            {tr('Schedule Takeover', 'جدولة التحكم')}
          </button>
          {active.length > 0 && <button type="button" className="secondary-button takeover-manage-button" aria-label="Return to AI" onClick={() => openDrawer()}>
            {tr('Return to AI', 'العودة للذكاء الاصطناعي')}
          </button>}
        </div>
      </div>

      {loadFailed && <button type="button" className="compact-button" onClick={() => void load()}>{tr('Retry status check', 'إعادة التحقق من الحالة')}</button>}
      {!loading && !loadFailed && nextWindow && (
        <button type="button" className="takeover-summary" onClick={() => openDrawer()}>
          <span className="takeover-summary-icon" aria-hidden="true">◉</span>
          <span className="takeover-summary-copy">
            <strong>{nextWindow.status === 'ACTIVE' ? tr('Human takeover active', 'التحكم البشري نشط') : tr('Scheduled takeover', 'تحكم بشري مجدول')}</strong>
            <small>{nextWindow.externalChannelName || tr('Community', 'المجتمع')} · {localDateTime(nextWindow.startsAt, locale)}–{localDateTime(nextWindow.endsAt, locale)}</small>
          </span>
          <span className="takeover-summary-link">{tr('View', 'عرض')} →</span>
        </button>
      )}

      {drawerOpen && (
        <div className="takeover-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDrawerOpen(false);
        }}>
          <aside className="takeover-drawer" role="dialog" aria-modal="true" aria-labelledby="takeover-title">
            <div className="takeover-drawer-head">
              <div>
                <p className="eyebrow">{tr('Human Takeover', 'التحكم البشري')}</p>
                <h2 id="takeover-title">{tr('Take over AI replies', 'تولّي الردود بدل الذكاء الاصطناعي')}</h2>
                <p className="muted">{tr('Pause automated replies without dealing with technical IDs.', 'أوقف الردود الآلية من دون التعامل مع معرّفات تقنية.')}</p>
              </div>
              <button type="button" className="takeover-close" aria-label={tr('Close takeover manager', 'إغلاق إدارة التحكم')} onClick={() => setDrawerOpen(false)}>×</button>
            </div>

            <form className="takeover-form" onSubmit={submit}>
              <div className="takeover-section">
                <p className="eyebrow">{tr('Where', 'أين')}</p>
                <label>
                  <span>{tr('Community or conversation', 'المجتمع أو المحادثة')}</span>
                  <select aria-label="Community or conversation" value={communityId} onChange={(event) => setCommunityId(event.target.value)} disabled={loading || !targets.length}>
                    {!targets.length && <option value="">{loading ? tr('Loading communities…', 'جارٍ تحميل المجتمعات…') : tr('No eligible communities', 'لا توجد مجتمعات متاحة')}</option>}
                    {targets.map((target) => (
                      <option key={target.communityId} value={target.communityId}>{target.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="takeover-section">
                <p className="eyebrow">{tr('When', 'متى')}</p>
                <div className="takeover-mode-switch" role="group" aria-label={tr('Takeover timing', 'توقيت التحكم')}>
                  <button type="button" aria-label="Take over now" className={mode === 'NOW' ? 'active' : ''} onClick={() => chooseMode('NOW')}>{tr('Take over now', 'ابدأ الآن')}</button>
                  <button type="button" aria-label="Schedule" className={mode === 'SCHEDULE' ? 'active' : ''} onClick={() => chooseMode('SCHEDULE')}>{tr('Schedule', 'جدولة')}</button>
                </div>

                {mode === 'NOW' ? (
                  <div className="takeover-quick-block">
                    <span>{tr('Duration', 'المدة')}</span>
                    <div className="takeover-duration-chips">
                      {QUICK_DURATIONS.map((duration) => (
                        <button
                          key={duration.label}
                          type="button"
                          aria-label={duration.label}
                          className={quickDuration === duration.value ? 'active' : ''}
                          onClick={() => setQuickDuration(duration.value)}
                        >{duration.label === 'Until tomorrow' ? tr('Until tomorrow', 'حتى الغد') : duration.label === 'Custom' ? tr('Custom', 'مخصص') : duration.label}</button>
                      ))}
                    </div>
                    {quickDuration === 'TOMORROW' && <small className="takeover-duration-hint">{tr('AI returns tomorrow at 9:00 AM.', 'يعود الذكاء الاصطناعي غدًا الساعة 9:00 صباحًا.')}</small>}
                    {quickDuration === 'CUSTOM' && <label>
                      <span>{tr('Return to AI at', 'العودة للذكاء الاصطناعي عند')}</span>
                      <input aria-label="Custom return time" type="datetime-local" value={customEndsAt} onChange={(event) => setCustomEndsAt(event.target.value)} required />
                    </label>}
                  </div>
                ) : (
                  <div className="takeover-time-grid">
                    <label>
                      <span>{tr('Starts', 'يبدأ')}</span>
                      <input aria-label="Takeover starts" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
                    </label>
                    <label>
                      <span>{tr('AI resumes', 'يستأنف الذكاء الاصطناعي')}</span>
                      <input aria-label="AI resumes" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
                    </label>
                  </div>
                )}
              </div>

              <div className="takeover-section">
                <label>
                  <span>{tr('Reason', 'السبب')} <small>{tr('optional', 'اختياري')}</small></span>
                  <input aria-label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder={tr('Community event coverage', 'تغطية حدث للمجتمع')} />
                </label>
              </div>

              <div className="takeover-explainer" role="note">
                <span aria-hidden="true">✓</span>
                <div>
                  <strong>{tr('What will happen', 'ماذا سيحدث')}</strong>
                  <p>{tr('AI stops replying here, but incoming messages stay visible.', 'يتوقف الذكاء الاصطناعي عن الرد هنا، لكن الرسائل الواردة تبقى ظاهرة.')}</p>
                  <p>{mode === 'NOW'
                    ? tr('AI replies automatically resume when the selected duration ends.', 'تستأنف ردود الذكاء الاصطناعي تلقائيًا عند انتهاء المدة المحددة.')
                    : tr('AI replies automatically resume at the time you choose.', 'تستأنف ردود الذكاء الاصطناعي تلقائيًا في الوقت الذي تختاره.')}</p>
                </div>
              </div>

              {error && <div className="takeover-alert error" role="alert">{error}</div>}
              {notice && <div className="takeover-alert success" role="status">{notice}</div>}

              <div className="takeover-drawer-actions">
                <button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>{tr('Close', 'إغلاق')}</button>
                <button type="submit" className="primary-button" disabled={submitting || loading || !communityId} aria-label={mode === 'NOW' ? 'Start takeover' : 'Schedule takeover'}>
                  {submitting ? tr('Saving…', 'جارٍ الحفظ…') : mode === 'NOW' ? tr('Start takeover', 'بدء التحكم') : tr('Schedule takeover', 'جدولة التحكم')}
                </button>
              </div>
            </form>

            <section className="takeover-window-section" aria-label="Active Takeovers">
              <div className="takeover-current-head"><h3>{tr('Active Takeovers', 'عمليات التحكم النشطة')}</h3><span>{active.length}</span></div>
              {active.length ? <div className="takeover-window-table">
                <div className="takeover-window-row takeover-window-head"><span>{tr('Community', 'المجتمع')}</span><span>{tr('Started', 'بدأ')}</span><span>{tr('Returns to AI', 'العودة للذكاء الاصطناعي')}</span><span>{tr('Action', 'الإجراء')}</span></div>
                {active.map((item) => <div className="takeover-window-row" key={item.id}>
                  <span data-label={tr('Community', 'المجتمع')}><small>{platformLabel(item.platform)}</small><strong>{item.externalChannelName || tr('Community', 'المجتمع')}</strong></span>
                  <span data-label={tr('Started', 'بدأ')}>{localDateTime(item.startsAt, locale)}</span>
                  <span data-label={tr('Returns to AI', 'العودة للذكاء الاصطناعي')}>{localDateTime(item.endsAt, locale)}</span>
                  <span data-label={tr('Action', 'الإجراء')}><button type="button" className="secondary-button" aria-label="Return to AI" disabled={submitting} onClick={() => void returnToAi(item.id)}>{tr('Return to AI', 'العودة للذكاء الاصطناعي')}</button></span>
                </div>)}
              </div> : <p className="takeover-empty">{tr('No active takeovers.', 'لا توجد عمليات تحكم نشطة.')}</p>}
            </section>

            <section className="takeover-window-section" aria-label="Upcoming Takeovers">
              <div className="takeover-current-head"><h3>{tr('Upcoming Takeovers', 'عمليات التحكم القادمة')}</h3><span>{upcoming.length}</span></div>
              {upcoming.length ? <div className="takeover-window-table">
                <div className="takeover-window-row takeover-window-head"><span>{tr('Community', 'المجتمع')}</span><span>{tr('Starts', 'يبدأ')}</span><span>{tr('Duration', 'المدة')}</span><span>{tr('Action', 'الإجراء')}</span></div>
                {upcoming.map((item) => <div className="takeover-window-row" key={item.id}>
                  <span data-label={tr('Community', 'المجتمع')}><small>{platformLabel(item.platform)}</small><strong>{item.externalChannelName || tr('Community', 'المجتمع')}</strong></span>
                  <span data-label={tr('Starts', 'يبدأ')}>{localDateTime(item.startsAt, locale)}</span>
                  <span data-label={tr('Duration', 'المدة')}>{formatSleepDuration(item.startsAt, item.endsAt)}</span>
                  <span data-label={tr('Action', 'الإجراء')}><button type="button" className="secondary-button" aria-label="Cancel" disabled={submitting} onClick={() => void returnToAi(item.id)}>{tr('Cancel', 'إلغاء')}</button></span>
                </div>)}
              </div> : <p className="takeover-empty">{tr('No upcoming takeovers.', 'لا توجد عمليات تحكم قادمة.')}</p>}
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
