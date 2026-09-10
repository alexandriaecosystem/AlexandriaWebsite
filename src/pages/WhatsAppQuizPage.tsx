import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import { getSupabaseClient } from '../services/supabase';
import {
  addWhatsappQuizQuestion,
  loadWhatsappQuizAdmin,
  saveAdmissionQuizSettings,
  saveWhatsappQuizSchedule,
  type QuizFrequency,
  type WhatsAppQuizAdminData,
  type WhatsAppQuizTarget,
} from '../services/whatsapp-quiz';
import './WhatsAppQuizPage.css';
import '../operational-ux.css';

const DAYS = [
  { value: 1, en: 'Monday', ar: 'الاثنين' },
  { value: 2, en: 'Tuesday', ar: 'الثلاثاء' },
  { value: 3, en: 'Wednesday', ar: 'الأربعاء' },
  { value: 4, en: 'Thursday', ar: 'الخميس' },
  { value: 5, en: 'Friday', ar: 'الجمعة' },
  { value: 6, en: 'Saturday', ar: 'السبت' },
  { value: 7, en: 'Sunday', ar: 'الأحد' },
] as const;

const EMPTY_OPTIONS = ['', '', '', ''];
const PUBLIC_EXPLANATION_EN = 'To be considered for VIP access, join our public community and take part in the daily quizzes and discussions. The team reviews participation and may invite you to submit your details for verification. VIP access is granted after final approval.';
const PUBLIC_EXPLANATION_AR = 'للنظر في منحك وصول VIP، انضم إلى مجتمعنا العام وشارك في الاختبارات والنقاشات اليومية. يراجع الفريق المشاركة وقد يدعوك إلى تقديم بياناتك للتحقق. يُمنح وصول VIP بعد الموافقة النهائية.';

function formatDate(value: string | null, locale: string | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Beirut' });
}

function isPublicQuizTarget(target: WhatsAppQuizTarget): boolean {
  return target.communityLevel.toUpperCase() === 'GENERAL' && !/announcement/i.test(target.name);
}

function preferredQuizTarget(targets: WhatsAppQuizTarget[]): WhatsAppQuizTarget | undefined {
  return targets.find((target) => isPublicQuizTarget(target) && /general/i.test(target.name))
    ?? targets.find(isPublicQuizTarget);
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
  const [greeting, setGreeting] = useState('');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [contentSaving, setContentSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contentError, setContentError] = useState('');
  const [contentNotice, setContentNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [questionPrompt, setQuestionPrompt] = useState('');
  const [questionOptions, setQuestionOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [correctOptionIndex, setCorrectOptionIndex] = useState(0);
  const [questionSaving, setQuestionSaving] = useState(false);
  const [questionError, setQuestionError] = useState('');
  const [questionNotice, setQuestionNotice] = useState('');

  const locale = isArabic ? 'ar-LB' : undefined;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void loadWhatsappQuizAdmin(getSupabaseClient())
      .then((next) => {
        if (!active) return;
        const publicTargets = next.targets.filter(isPublicQuizTarget);
        setData(next);
        setTargets(publicTargets);
        const savedTarget = publicTargets.some((target) => target.communityId === next.schedule.communityId)
          ? next.schedule.communityId
          : null;
        setCommunityId(savedTarget || preferredQuizTarget(publicTargets)?.communityId || '');
        setEnabled(next.schedule.enabled);
        setFrequency(next.schedule.frequency);
        setTimeOfDay(next.schedule.timeOfDay || '19:00');
        if (next.schedule.frequency === 'weekly' && next.schedule.daysOfWeek[0]) setWeeklyDay(next.schedule.daysOfWeek[0]);
        setCustomDays(next.schedule.frequency === 'custom' ? next.schedule.daysOfWeek : []);
        setGreeting(next.admission.greeting);
        setSelectedQuestionIds(next.admission.questionIds);
      })
      .catch(() => {
        if (active) setError(tr('Could not load the VIP admission quiz settings.', 'تعذر تحميل إعدادات اختبار قبول VIP.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [reload, tr]);

  const selectedDays = useMemo(() => {
    if (frequency === 'weekly') return [weeklyDay];
    if (frequency === 'custom') return [...customDays].sort((a, b) => a - b);
    return [];
  }, [customDays, frequency, weeklyDay]);

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!communityId) {
      setError(tr('Choose the public WhatsApp community.', 'اختر مجتمع WhatsApp العام.'));
      return;
    }
    if (frequency === 'custom' && !customDays.length) {
      setError(tr('Choose at least one day for a custom schedule.', 'اختر يومًا واحدًا على الأقل للجدول المخصص.'));
      return;
    }

    setScheduleSaving(true);
    try {
      await saveWhatsappQuizSchedule(getSupabaseClient(), {
        enabled,
        communityId,
        frequency,
        timeOfDay,
        timezone: 'Asia/Beirut',
        daysOfWeek: selectedDays,
      });
      setNotice(tr('Quiz schedule saved. No quiz was sent by this save.', 'تم حفظ جدول الاختبار. لم يتم إرسال أي اختبار بسبب الحفظ.'));
      setReload((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('The quiz schedule could not be updated.', 'تعذر تحديث جدول الاختبار.'));
    } finally {
      setScheduleSaving(false);
    }
  }

  async function saveQuizContent(event: FormEvent) {
    event.preventDefault();
    setContentError('');
    setContentNotice('');
    if (!greeting.trim()) {
      setContentError(tr('Enter the daily greeting.', 'أدخل التحية اليومية.'));
      return;
    }
    if (selectedQuestionIds.length !== 5) {
      setContentError(tr('Select exactly five questions.', 'اختر خمسة أسئلة بالضبط.'));
      return;
    }

    setContentSaving(true);
    try {
      await saveAdmissionQuizSettings(getSupabaseClient(), {
        greeting: greeting.trim(),
        questionIds: selectedQuestionIds,
        formOrigin: data?.admission.formOrigin ?? null,
      });
      setContentNotice(tr('Daily quiz content saved. No quiz was sent by this save.', 'تم حفظ محتوى الاختبار اليومي. لم يتم إرسال أي اختبار بسبب الحفظ.'));
      setReload((value) => value + 1);
    } catch (caught) {
      setContentError(caught instanceof Error ? caught.message : tr('The quiz content could not be saved.', 'تعذر حفظ محتوى الاختبار.'));
    } finally {
      setContentSaving(false);
    }
  }

  function toggleAdmissionQuestion(id: string) {
    setContentError('');
    setSelectedQuestionIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 5) {
        setContentError(tr('Five questions are already selected. Remove one before adding another.', 'تم اختيار خمسة أسئلة بالفعل. أزل سؤالاً قبل إضافة سؤال آخر.'));
        return current;
      }
      return [...current, id];
    });
  }

  async function addQuestion(event: FormEvent) {
    event.preventDefault();
    const prompt = questionPrompt.trim();
    const options = questionOptions.map((option) => option.trim());
    const uniqueOptions = new Set(options.map((option) => option.toLocaleLowerCase()));
    setQuestionError('');
    setQuestionNotice('');
    if (!prompt || options.some((option) => !option)) {
      setQuestionError(tr('Enter the question and all four answer options.', 'أدخل السؤال وخيارات الإجابة الأربعة.'));
      return;
    }
    if (uniqueOptions.size !== 4) {
      setQuestionError(tr('Each answer option must be different.', 'يجب أن يكون كل خيار إجابة مختلفًا.'));
      return;
    }

    setQuestionSaving(true);
    try {
      await addWhatsappQuizQuestion(getSupabaseClient(), { prompt, options, correctOptionIndex });
      setQuestionPrompt('');
      setQuestionOptions([...EMPTY_OPTIONS]);
      setCorrectOptionIndex(0);
      setQuestionNotice(tr('Question added to the active question bank.', 'تمت إضافة السؤال إلى بنك الأسئلة النشط.'));
      setReload((value) => value + 1);
    } catch (caught) {
      setQuestionError(caught instanceof Error ? caught.message : tr('The question could not be added.', 'تعذرت إضافة السؤال.'));
    } finally {
      setQuestionSaving(false);
    }
  }

  function updateQuestionOption(index: number, value: string) {
    setQuestionOptions((current) => current.map((option, optionIndex) => optionIndex === index ? value : option));
  }

  function toggleCustomDay(day: number) {
    setCustomDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day]);
  }

  if (loading && !data) {
    return <><header className="page-header"><div><h1>{tr('VIP admission quiz', 'اختبار قبول VIP')}</h1></div></header><LoadingState label={tr('Loading quiz settings', 'جارٍ تحميل إعدادات الاختبار')} /></>;
  }
  if (error && !data) {
    return <><header className="page-header"><div><h1>{tr('VIP admission quiz', 'اختبار قبول VIP')}</h1></div></header><RetryableErrorState onRetry={() => setReload((value) => value + 1)} /></>;
  }

  const schedule = data?.schedule;
  const statusActive = schedule?.enabled === true && schedule.status !== 'ERROR';
  const questionStats = data?.questionStats ?? null;
  const previewQuestions = data?.questions ?? [];
  const admission = data?.admission;

  return <>
    <header className="page-header quiz-page-header">
      <div>
        <p className="eyebrow">{tr('VIP admission', 'قبول VIP')}</p>
        <h1>{tr('Public community quiz', 'اختبار المجتمع العام')}</h1>
        <p className="muted page-subtitle">{tr('Configure the five poll questions used for community participation. Admission decisions remain human-reviewed.', 'اضبط أسئلة الاستطلاع الخمسة المستخدمة للمشاركة المجتمعية. تبقى قرارات القبول خاضعة للمراجعة البشرية.')}</p>
      </div>
      <span className={`status-pill ${statusActive ? 'positive' : schedule?.status === 'ERROR' ? 'negative' : 'neutral'}`}>
        {schedule?.status === 'ERROR' ? tr('Needs attention', 'يحتاج إلى متابعة') : statusActive ? tr('Scheduled quiz active', 'الاختبار المجدول نشط') : tr('Scheduled quiz paused', 'الاختبار المجدول متوقف')}
      </span>
    </header>

    {schedule?.status === 'ERROR' && <div className="quiz-friendly-error" role="alert">{tr('The scheduler needs attention. Refresh its status before changing the schedule.', 'المجدول يحتاج إلى متابعة. حدّث حالته قبل تغيير الجدول.')} <button type="button" className="compact-button" onClick={() => setReload((value) => value + 1)}>{tr('Refresh status', 'تحديث الحالة')}</button></div>}
    {error && data && <div className="form-error" role="alert">{error}</div>}
    {notice && <div className="form-success" role="status">{notice}</div>}

    <ol className="operational-flow" aria-label={tr('How VIP admission works', 'كيف يعمل قبول VIP')}>
      <li>{tr('Five public quiz polls', 'خمسة استطلاعات عامة')}</li>
      <li>{tr('Participation & discussion', 'المشاركة والنقاش')}</li>
      <li>{tr('Assessment review', 'مراجعة التقييم')}</li>
      <li>{tr('Information verification', 'التحقق من المعلومات')}</li>
      <li>{tr('Final approval & access delivery', 'الموافقة النهائية وتسليم الوصول')}</li>
    </ol>

    <section className="panel public-wording-preview">
      <p className="panel-kicker">{tr('Applicant-facing wording', 'النص الموجّه للمتقدم')}</p>
      <h2>{tr('How to be considered for VIP', 'كيفية النظر في طلب VIP')}</h2>
      <p>{tr(PUBLIC_EXPLANATION_EN, PUBLIC_EXPLANATION_AR)}</p>
    </section>

    {!admission?.formOrigin && <div className="quiz-friendly-error admission-dependency" role="status">
      <strong>{tr('Information submission is not configured.', 'إرسال معلومات المتقدم غير مهيأ.')}</strong>{' '}
      {tr('The live admission_settings.form_origin value is empty. Assessment reviews can continue, but “Request information” must remain unavailable until that backend setting points to the secure applicant form.', 'قيمة admission_settings.form_origin الحالية فارغة. يمكن متابعة مراجعات التقييم، لكن يجب أن يبقى إجراء «طلب المعلومات» غير متاح حتى يشير إعداد الخلفية إلى نموذج المتقدم الآمن.')}
    </div>}

    <div className="quiz-layout">
      <form className="panel quiz-schedule-card" onSubmit={saveSchedule}>
        <div className="section-heading quiz-section-heading">
          <div><p className="eyebrow">{tr('Delivery', 'التسليم')}</p><h2>{tr('Schedule', 'الجدول')}</h2></div>
          <label className="quiz-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span aria-hidden="true" />
            <strong>{enabled ? tr('ON', 'تشغيل') : tr('OFF', 'إيقاف')}</strong>
          </label>
        </div>

        <div className="quiz-form-grid">
          <label>
            <span>{tr('Public community', 'المجتمع العام')}</span>
            <select aria-label="Community" value={communityId} onChange={(event) => setCommunityId(event.target.value)} disabled={!targets.length}>
              {!targets.length && <option value="">{tr('No eligible public WhatsApp community available', 'لا يوجد مجتمع WhatsApp عام مؤهل')}</option>}
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
          <div><span>{tr('Questions', 'الأسئلة')}</span><strong>{tr('5 questions per quiz', '5 أسئلة لكل اختبار')}</strong></div>
        </div>

        <div className="quiz-actions">
          <button type="submit" className="primary" disabled={scheduleSaving || !communityId}>{scheduleSaving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save schedule', 'حفظ الجدول')}</button>
        </div>
        <p className="muted quiz-save-note">{tr('Saving updates configuration only. It never sends a quiz immediately.', 'الحفظ يحدّث الإعدادات فقط ولا يرسل اختبارًا فورًا.')}</p>
      </form>

      <aside className="panel quiz-status-card">
        <p className="eyebrow">{tr('Delivery status', 'حالة التسليم')}</p>
        <h2>{schedule?.communityName || targets.find((target) => target.communityId === communityId)?.name || tr('Public community', 'المجتمع العام')}</h2>
        <dl className="profile-list">
          <div><dt>{tr('State', 'الحالة')}</dt><dd>{schedule?.status || '—'}</dd></div>
          <div><dt>{tr('Last delivery', 'آخر تسليم')}</dt><dd>{formatDate(schedule?.lastRunAt ?? null, locale)}</dd></div>
          <div><dt>{tr('Next delivery', 'التسليم التالي')}</dt><dd>{formatDate(schedule?.nextRunAt ?? null, locale)}</dd></div>
          <div><dt>{tr('Last error', 'آخر خطأ')}</dt><dd>{schedule?.lastError || '—'}</dd></div>
        </dl>
      </aside>
    </div>

    <form className="panel admission-content-card" onSubmit={saveQuizContent}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{tr('Daily quiz content', 'محتوى الاختبار اليومي')}</p>
          <h2>{tr('Greeting and five selected questions', 'التحية والأسئلة الخمسة المحددة')}</h2>
          <p className="muted">{tr('These values come from the current admission backend. The correct answers are not exposed here.', 'تأتي هذه القيم من خلفية القبول الحالية. لا يتم عرض الإجابات الصحيحة هنا.')}</p>
        </div>
        <span className={`status-pill ${selectedQuestionIds.length === 5 ? 'positive' : 'neutral'}`}>{tr(`${selectedQuestionIds.length} selected`, `${selectedQuestionIds.length} محددة`)}</span>
      </div>

      {contentError && <div className="form-error" role="alert">{contentError}</div>}
      {contentNotice && <div className="form-success" role="status">{contentNotice}</div>}

      <label className="admission-greeting-field">
        <span>{tr('Daily greeting', 'التحية اليومية')}</span>
        <textarea aria-label="Daily greeting" value={greeting} onChange={(event) => setGreeting(event.target.value)} maxLength={1000} rows={3} />
      </label>

      <div className="admission-question-list" aria-label={tr('Admission question bank', 'بنك أسئلة القبول')}>
        {admission?.questionBank.map((question) => (
          <label key={question.id} className={selectedQuestionIds.includes(question.id) ? 'selected' : ''}>
            <input
              type="checkbox"
              aria-label={question.prompt}
              checked={selectedQuestionIds.includes(question.id)}
              onChange={() => toggleAdmissionQuestion(question.id)}
            />
            <span className="question-number">#{question.number}</span>
            <span>{question.prompt}</span>
          </label>
        ))}
        {!admission?.questionBank.length && <p className="muted">{tr('No active admission questions are available.', 'لا توجد أسئلة قبول نشطة متاحة.')}</p>}
      </div>

      <div className="quiz-actions">
        <button type="submit" className="primary" disabled={contentSaving || selectedQuestionIds.length !== 5 || !greeting.trim()}>{contentSaving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save quiz content', 'حفظ محتوى الاختبار')}</button>
      </div>
      <p className="muted quiz-save-note">{tr('Saving the greeting and five question IDs does not trigger delivery.', 'حفظ التحية ومعرّفات الأسئلة الخمسة لا يؤدي إلى الإرسال.')}</p>
    </form>

    <section className="panel quiz-bank-panel">
      <div className="section-heading">
        <div><p className="eyebrow">{tr('Question bank', 'بنك الأسئلة')}</p><h2>{tr('Add a question', 'إضافة سؤال')}</h2><p className="muted">{tr('New valid questions become available for future five-question selections.', 'تصبح الأسئلة الجديدة الصالحة متاحة للاختيارات المستقبلية المكوّنة من خمسة أسئلة.')}</p></div>
        {questionStats && <span className="status-pill neutral">{tr(`${questionStats.active} active`, `${questionStats.active} نشط`)}</span>}
      </div>

      <form className="quiz-question-form" onSubmit={addQuestion}>
        {questionError && <div className="form-error" role="alert">{questionError}</div>}
        {questionNotice && <div className="form-success" role="status">{questionNotice}</div>}
        <label><span>{tr('Question', 'السؤال')}</span><textarea aria-label="New quiz question" value={questionPrompt} onChange={(event) => setQuestionPrompt(event.target.value)} rows={3} /></label>
        <fieldset className="quiz-option-editor">
          <legend>{tr('Answer options', 'خيارات الإجابة')}</legend>
          {questionOptions.map((option, index) => <label key={index} className="quiz-option-row"><input type="radio" name="correct-option" aria-label={tr(`Mark option ${index + 1} correct`, `تعيين الخيار ${index + 1} كإجابة صحيحة`)} checked={correctOptionIndex === index} onChange={() => setCorrectOptionIndex(index)} /><input aria-label={tr(`Option ${index + 1}`, `الخيار ${index + 1}`)} value={option} onChange={(event) => updateQuestionOption(index, event.target.value)} placeholder={tr(`Option ${index + 1}`, `الخيار ${index + 1}`)} /></label>)}
        </fieldset>
        <div className="quiz-actions"><button type="submit" className="secondary" disabled={questionSaving}>{questionSaving ? tr('Adding…', 'جارٍ الإضافة…') : tr('Add to question bank', 'إضافة إلى بنك الأسئلة')}</button></div>
      </form>
    </section>

    <section className="panel quiz-preview-panel">
      <div className="section-heading"><div><p className="eyebrow">{tr('Delivery preview', 'معاينة التسليم')}</p><h2>{tr('Five-question preview', 'معاينة خمسة أسئلة')}</h2></div></div>
      {data?.questionPreviewStatus === 'ERROR' ? <p className="muted">{tr('Preview is currently unavailable. The saved five-question selection above remains the source of truth.', 'المعاينة غير متاحة حاليًا. يبقى اختيار الأسئلة الخمسة المحفوظ أعلاه هو مصدر الحقيقة.')}</p> : previewQuestions.length ? <ol className="quiz-preview-list">{previewQuestions.map((question) => <li key={question.id}><strong>#{question.sourceQuestionNo}</strong><span>{question.prompt}</span></li>)}</ol> : <p className="muted">{tr('No preview questions are available.', 'لا توجد أسئلة معاينة متاحة.')}</p>}
    </section>
  </>;
}
