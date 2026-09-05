import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getSupabaseClient } from '../services/supabase';
import {
  cancelAiSleepWindow,
  classifyAiSleepWindow,
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

type TakeoverManagerProps = {
  now?: Date;
  listTargets?: () => Promise<TakeoverTarget[]>;
  listWindows?: () => Promise<AiSleepWindowList>;
  createWindow?: (input: CreateCommunityTakeoverInput) => Promise<unknown>;
  cancelWindow?: (windowId: string) => Promise<void>;
  onActiveCountChange?: (count: number) => void;
};

const QUICK_DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
] as const;

function localDateTime(value: string, locale?: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
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
  const [notice, setNotice] = useState('');
  const [clock, setClock] = useState(now ?? new Date());
  const [mode, setMode] = useState<TakeoverMode>('SCHEDULE');
  const [communityId, setCommunityId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');
  const [quickMinutes, setQuickMinutes] = useState(120);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedTargets, loadedWindows] = await Promise.all([
        listTargets ? listTargets() : listTakeoverTargets(getSupabaseClient()),
        listWindows ? listWindows() : listAiSleepWindows(getSupabaseClient(), { limit: 100 }),
      ]);
      setTargets(loadedTargets);
      setWindows(loadedWindows.items);
      setCommunityId((current) => current || loadedTargets[0]?.communityId || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not load takeovers.', 'تعذر تحميل عمليات التحكم البشري.'));
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
  const relevant = [...active, ...upcoming];
  const nextWindow = relevant[0] ?? null;
  const locale = isArabic ? 'ar-LB' : undefined;

  useEffect(() => { onActiveCountChange?.(active.length); }, [active.length, onActiveCountChange]);

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
        input = {
          communityId,
          startsAt: base.toISOString(),
          endsAt: new Date(base.getTime() + quickMinutes * 60_000).toISOString(),
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not save the takeover.', 'تعذر حفظ التحكم البشري.'));
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
      setNotice(tr('AI replies are enabled again for new messages.', 'تمت إعادة تفعيل ردود الذكاء الاصطناعي للرسائل الجديدة.'));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Could not return to AI.', 'تعذر إعادة التحكم للذكاء الاصطناعي.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="takeover-shell" aria-label={tr('Human takeovers', 'التحكم البشري')}>
      <div className="takeover-toolbar-actions">
        <span className={`status-pill ${active.length ? 'negative' : 'positive'}`}>
          <span className="takeover-status-dot" aria-hidden="true" />
          {active.length ? `${active.length} ${tr('human takeover', 'تحكم بشري')}` : tr('AI replying', 'الذكاء الاصطناعي يرد')}
        </span>
        <button type="button" className="secondary-button takeover-manage-button" aria-label="Manage takeovers" onClick={() => setDrawerOpen(true)}>
          {tr('Manage takeovers', 'إدارة التحكم البشري')}
        </button>
      </div>

      {nextWindow && (
        <button type="button" className="takeover-summary" onClick={() => setDrawerOpen(true)}>
          <span className="takeover-summary-icon" aria-hidden="true">◉</span>
          <span className="takeover-summary-copy">
            <strong>{nextWindow.status === 'ACTIVE' ? tr('Human takeover active', 'التحكم البشري نشط') : tr('Scheduled takeover', 'تحكم بشري مجدول')}</strong>
            <small>{nextWindow.externalChannelName || tr('Community', 'المجتمع')} · {localDateTime(nextWindow.startsAt, locale)}–{new Date(nextWindow.endsAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}</small>
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
                <p className="eyebrow">{tr('Human takeover', 'التحكم البشري')}</p>
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
                    <span>{tr('Quick duration', 'مدة سريعة')}</span>
                    <div className="takeover-duration-chips">
                      {QUICK_DURATIONS.map((duration) => (
                        <button
                          key={duration.minutes}
                          type="button"
                          aria-label={duration.label}
                          className={quickMinutes === duration.minutes ? 'active' : ''}
                          onClick={() => setQuickMinutes(duration.minutes)}
                        >{duration.label}</button>
                      ))}
                    </div>
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
                <button type="button" className="secondary-button" onClick={() => setDrawerOpen(false)}>{tr('Cancel', 'إلغاء')}</button>
                <button type="submit" className="primary-button" disabled={submitting || loading || !communityId} aria-label={mode === 'NOW' ? 'Start takeover' : 'Schedule takeover'}>
                  {submitting ? tr('Saving…', 'جارٍ الحفظ…') : mode === 'NOW' ? tr('Start takeover', 'بدء التحكم') : tr('Schedule takeover', 'جدولة التحكم')}
                </button>
              </div>
            </form>

            {!!relevant.length && (
              <div className="takeover-current-list">
                <div className="takeover-current-head">
                  <h3>{tr('Active & upcoming', 'النشطة والقادمة')}</h3>
                  <span>{relevant.length}</span>
                </div>
                {relevant.map((item) => (
                  <article key={item.id} className="takeover-current-card">
                    <div>
                      <small className="takeover-platform-label">{platformLabel(item.platform)}</small>
                      <strong>{item.externalChannelName || tr('Community', 'المجتمع')}</strong>
                      <span>{localDateTime(item.startsAt, locale)} → {localDateTime(item.endsAt, locale)}</span>
                    </div>
                    <button type="button" className="secondary-button" disabled={submitting} onClick={() => void returnToAi(item.id)}>
                      {item.status === 'ACTIVE' ? tr('Return to AI', 'إعادة التحكم للذكاء الاصطناعي') : tr('Cancel schedule', 'إلغاء الجدولة')}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}
