import { useEffect, useMemo, useState } from 'react';
import { EmptyState, LoadingState, RetryableErrorState } from '../components/AsyncState';
import { getAiUsageSummary, getAiUsageTimeseries, getModelUsage, getPlatformStats } from '../services/admin';
import { getAiBilling, listServiceSubscriptions, refreshOpenRouterBalance, updateServiceSubscription, type AiBilling, type ServiceSubscription } from '../services/cost-transparency';
import { getSupabaseClient } from '../services/supabase';
import type { AiUsageSeriesPoint, AiUsageSummary, ModelUsageStat, PlatformStat } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

const LOW_BALANCE_THRESHOLD_USD = 5;

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const presets = [1, 7, 30, 90] as const;

function safeSubtract(currentWindow: number, current: number) {
  return Math.max(0, currentWindow - current);
}

function previousSummaryFrom(combined: AiUsageSummary, current: AiUsageSummary, days: number): AiUsageSummary {
  const purposes = new Set([...Object.keys(combined.byPurpose), ...Object.keys(current.byPurpose)]);
  const byPurpose: AiUsageSummary['byPurpose'] = {};
  purposes.forEach((purpose) => {
    const total = combined.byPurpose[purpose];
    const now = current.byPurpose[purpose];
    const calls = safeSubtract(total?.calls ?? 0, now?.calls ?? 0);
    const cacheHitCount = safeSubtract(total?.cacheHitCount ?? 0, now?.cacheHitCount ?? 0);
    byPurpose[purpose] = {
      calls,
      inputTokens: safeSubtract(total?.inputTokens ?? 0, now?.inputTokens ?? 0),
      outputTokens: safeSubtract(total?.outputTokens ?? 0, now?.outputTokens ?? 0),
      totalTokens: safeSubtract(total?.totalTokens ?? 0, now?.totalTokens ?? 0),
      costUsd: safeSubtract(total?.costUsd ?? 0, now?.costUsd ?? 0),
      cacheHitCount,
    };
  });

  const totalCalls = safeSubtract(combined.totalCalls, current.totalCalls);
  const successfulCalls = safeSubtract(combined.successfulCalls, current.successfulCalls);
  const failedCalls = safeSubtract(combined.failedCalls, current.failedCalls);
  const cacheHitCount = safeSubtract(combined.cacheHitCount, current.cacheHitCount);
  const costUsd = safeSubtract(combined.costUsd, current.costUsd);
  return {
    days,
    totalCalls,
    successfulCalls,
    failedCalls,
    cacheHitCount,
    cacheHitRate: totalCalls ? cacheHitCount / totalCalls : 0,
    inputTokens: safeSubtract(combined.inputTokens, current.inputTokens),
    outputTokens: safeSubtract(combined.outputTokens, current.outputTokens),
    totalTokens: safeSubtract(combined.totalTokens, current.totalTokens),
    costUsd,
    avgCostPerCall: totalCalls ? costUsd / totalCalls : 0,
    trackingHasEvents: combined.trackingHasEvents,
    trackingLastRecordedAt: combined.trackingLastRecordedAt,
    trackingMissing: combined.trackingMissing,
    byPurpose,
  };
}

function previousModelsFrom(combined: ModelUsageStat[], current: ModelUsageStat[]) {
  const currentMap = new Map(current.map((item) => [`${item.provider}:${item.model}`, item]));
  return combined.map((total) => {
    const now = currentMap.get(`${total.provider}:${total.model}`);
    const calls = safeSubtract(total.calls, now?.calls ?? 0);
    const successfulCalls = safeSubtract(total.successfulCalls, now?.successfulCalls ?? 0);
    const failedCalls = safeSubtract(total.failedCalls, now?.failedCalls ?? 0);
    const costUsd = safeSubtract(total.costUsd, now?.costUsd ?? 0);
    return {
      ...total,
      calls,
      successfulCalls,
      failedCalls,
      cacheHitCount: safeSubtract(total.cacheHitCount, now?.cacheHitCount ?? 0),
      inputTokens: safeSubtract(total.inputTokens, now?.inputTokens ?? 0),
      outputTokens: safeSubtract(total.outputTokens, now?.outputTokens ?? 0),
      totalTokens: safeSubtract(total.totalTokens, now?.totalTokens ?? 0),
      costUsd,
      avgCostPerCall: calls ? costUsd / calls : 0,
      successRate: calls ? successfulCalls / calls : 0,
    };
  }).filter((item) => item.calls > 0 || item.costUsd > 0);
}

function change(current: number, previous: number) {
  if (previous === 0) return current === 0 ? null : Number.POSITIVE_INFINITY;
  return (current - previous) / Math.abs(previous);
}

function Delta({ current, previous, inverse = false, tr }: { current: number; previous: number; inverse?: boolean; tr: (en: string, ar: string) => string }) {
  const value = change(current, previous);
  if (value == null) return <span className="delta-chip flat">{tr('No change', 'لا تغيير')}</span>;
  if (!Number.isFinite(value)) return <span className="delta-chip up">{tr('New activity', 'نشاط جديد')}</span>;
  const up = value > 0;
  const tone = value === 0 ? 'flat' : inverse ? (up ? 'down' : 'up') : (up ? 'up' : 'down');
  return <span className={`delta-chip ${tone}`}>{value > 0 ? '↑' : value < 0 ? '↓' : '•'} {Math.abs(value * 100).toFixed(1)}%</span>;
}

export function AnalyticsPage() {
  const { tr, isArabic } = useLanguage();
  const [days, setDays] = useState<number>(30);
  const [summary, setSummary] = useState<AiUsageSummary>();
  const [previousSummary, setPreviousSummary] = useState<AiUsageSummary>();
  const [series, setSeries] = useState<AiUsageSeriesPoint[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStat[]>([]);
  const [models, setModels] = useState<ModelUsageStat[]>([]);
  const [previousModels, setPreviousModels] = useState<ModelUsageStat[]>([]);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [billing, setBilling] = useState<AiBilling | null>(null);
  const [subscriptions, setSubscriptions] = useState<ServiceSubscription[]>([]);
  const [editingCostKey, setEditingCostKey] = useState<string | null>(null);
  const [editingCostValue, setEditingCostValue] = useState('');
  const [editingRenewsOn, setEditingRenewsOn] = useState('');
  const [costBusy, setCostBusy] = useState(false);
  const [costError, setCostError] = useState('');
  const [balanceBusy, setBalanceBusy] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  useEffect(() => {
    const client = getSupabaseClient();
    void getAiBilling(client).then(setBilling).catch(() => setBilling(null));
    void listServiceSubscriptions(client).then(setSubscriptions).catch(() => setSubscriptions([]));
  }, [reload]);

  function startEditing(item: ServiceSubscription) {
    setCostError('');
    setEditingCostKey(item.serviceKey);
    setEditingCostValue(item.monthlyCostUsd == null ? '' : String(item.monthlyCostUsd));
    setEditingRenewsOn(item.renewsOn ?? '');
  }

  async function saveSubscription(serviceKey: string) {
    const trimmed = editingCostValue.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setCostError(tr('Enter a number, for example 35', 'أدخل رقماً، مثال 35'));
      return;
    }
    setCostBusy(true);
    setCostError('');
    try {
      await updateServiceSubscription(getSupabaseClient(), serviceKey, { monthlyCostUsd: parsed, renewsOn: editingRenewsOn });
      setSubscriptions((current) => current.map((item) => item.serviceKey === serviceKey
        ? { ...item, monthlyCostUsd: parsed, renewsOn: editingRenewsOn || null }
        : item));
      setEditingCostKey(null);
    } catch (caught) {
      setCostError(caught instanceof Error ? caught.message : tr('Could not save.', 'تعذر الحفظ.'));
    } finally {
      setCostBusy(false);
    }
  }

  async function refreshBalance() {
    setBalanceBusy(true);
    setBalanceError('');
    try {
      const fresh = await refreshOpenRouterBalance(getSupabaseClient());
      setBilling((current) => ({ ...fresh, monthSpendUsd: current?.monthSpendUsd ?? 0 }));
    } catch (caught) {
      setBalanceError(caught instanceof Error ? caught.message : tr('Could not read the balance.', 'تعذرت قراءة الرصيد.'));
    } finally {
      setBalanceBusy(false);
    }
  }

  function renewalNotice(item: ServiceSubscription) {
    if (!item.renewsOn) return null;
    const due = new Date(`${item.renewsOn}T00:00:00`);
    if (Number.isNaN(due.getTime())) return null;
    const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
    const dateLabel = due.toLocaleDateString(isArabic ? 'ar-LB' : undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (days < 0) return { tone: 'negative', text: tr(`Renewal was due ${dateLabel}`, `كان موعد التجديد ${dateLabel}`) };
    if (days === 0) return { tone: 'negative', text: tr('Renews today', 'يتجدد اليوم') };
    if (days <= 7) return { tone: 'negative', text: tr(`Renews in ${days} days (${dateLabel})`, `يتجدد خلال ${days} أيام (${dateLabel})`) };
    return { tone: 'neutral', text: tr(`Renews ${dateLabel}`, `يتجدد في ${dateLabel}`) };
  }

  useEffect(() => {
    let active = true;
    setError(false);
    setSummary(undefined);
    setPreviousSummary(undefined);
    const client = getSupabaseClient();
    Promise.all([
      getAiUsageSummary(client, days),
      getAiUsageSummary(client, days * 2),
      getAiUsageTimeseries(client, days),
      getPlatformStats(client, days),
      getModelUsage(client, days),
      getModelUsage(client, days * 2),
    ]).then(([nextSummary, combinedSummary, nextSeries, nextPlatforms, nextModels, combinedModels]) => {
      if (!active) return;
      setSummary(nextSummary);
      setPreviousSummary(previousSummaryFrom(combinedSummary, nextSummary, days));
      setSeries(nextSeries);
      setPlatforms(nextPlatforms);
      setModels(nextModels);
      setPreviousModels(previousModelsFrom(combinedModels, nextModels));
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, [days, reload]);

  const maxDailyCost = useMemo(() => Math.max(...series.map((item) => item.costUsd), 0.000001), [series]);
  const noTelemetry = summary?.totalCalls === 0;
  const purposeRows = useMemo(() => summary ? Object.entries(summary.byPurpose).sort((a, b) => b[1].costUsd - a[1].costUsd) : [], [summary]);
  const maxPurposeCost = useMemo(() => Math.max(...purposeRows.map(([, item]) => item.costUsd), 0.000001), [purposeRows]);
  const previousModelMap = useMemo(() => new Map(previousModels.map((item) => [`${item.provider}:${item.model}`, item])), [previousModels]);
  const providerRows = useMemo(() => {
    const groups = new Map<string, { calls: number; cost: number; tokens: number; success: number }>();
    models.forEach((item) => {
      const current = groups.get(item.provider) ?? { calls: 0, cost: 0, tokens: 0, success: 0 };
      current.calls += item.calls;
      current.cost += item.costUsd;
      current.tokens += item.totalTokens;
      current.success += item.successfulCalls;
      groups.set(item.provider, current);
    });
    return Array.from(groups.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [models]);
  const periodLabel = days === 1 ? tr('Today', 'اليوم') : tr(`Last ${days} days`, `آخر ${days} يوماً`);
  const previousPeriodLabel = days === 1 ? tr('previous day', 'اليوم السابق') : tr(`previous ${days} days`, `${days} يوماً السابقة`);

  return (
    <>
      <header className="page-header analytics-header">
        <div>
          <p className="eyebrow">{tr('AI telemetry', 'قياسات الذكاء الاصطناعي')}</p>
          <h1>{tr('Usage & cost', 'الاستخدام والتكلفة')}</h1>
          <p className="muted page-subtitle">{tr('Understand spend, model efficiency and usage changes compared with the previous period.', 'افهم التكلفة وكفاءة النماذج وتغيرات الاستخدام مقارنة بالفترة السابقة.')}</p>
        </div>
        <div className="analytics-period-control" aria-label={tr('Analytics period', 'فترة التحليل')}>
          <small>{tr('Period', 'الفترة')}</small>
          <div className="analytics-presets">
            {presets.map((preset) => <button type="button" key={preset} className={days === preset ? 'active' : ''} aria-pressed={days === preset} onClick={() => setDays(preset)}>{preset === 1 ? tr('24h', '24س') : `${preset}d`}</button>)}
          </div>
        </div>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !summary || !previousSummary ? (
        <LoadingState label={tr('Loading AI telemetry', 'جارٍ تحميل بيانات الذكاء الاصطناعي')} />
      ) : (
        <>
          <div className="analytics-comparison-banner"><span className="status-pill neutral">{periodLabel}</span><span>{tr(`Compared with the ${previousPeriodLabel}.`, `مقارنة مع ${previousPeriodLabel}.`)}</span></div>

          <section className="analytics-grid upgraded-analytics-grid billing-overview-grid" aria-label={tr('Billing and subscriptions', 'الفوترة والاشتراكات')}>
            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('AI credit balance', 'رصيد الذكاء الاصطناعي')}</p><h2>{tr('OpenRouter credits', 'رصيد OpenRouter')}</h2></div>
                {billing?.creditsRemainingUsd != null && billing.creditsRemainingUsd < LOW_BALANCE_THRESHOLD_USD
                  ? <span className="status-pill negative">{tr('Top up needed', 'الشحن مطلوب')}</span>
                  : billing?.creditsRemainingUsd != null ? <span className="status-pill healthy">{tr('Balance OK', 'الرصيد جيد')}</span> : null}
              </div>
              {billing?.creditsRemainingUsd != null ? (
                <>
                  <p className="muted">{tr('Remaining prepaid credit that powers every AI reply. Top up before it reaches zero or the assistant stops answering.', 'الرصيد المتبقي المدفوع مسبقاً الذي يشغّل كل ردود الذكاء الاصطناعي. أعد الشحن قبل وصوله إلى الصفر وإلا يتوقف المساعد عن الرد.')}</p>
                  <div className="metric-grid compact-metrics">
                    <article className="metric-card"><span>{tr('Credits left', 'الرصيد المتبقي')}</span><strong>{money(billing.creditsRemainingUsd)}</strong></article>
                    <article className="metric-card"><span>{tr('Used so far', 'المستخدم حتى الآن')}</span><strong>{billing.creditsUsedUsd == null ? '—' : money(billing.creditsUsedUsd)}</strong></article>
                    <article className="metric-card"><span>{tr('Spent this month', 'إنفاق هذا الشهر')}</span><strong>{money(billing.monthSpendUsd)}</strong></article>
                  </div>
                  <p className="muted"><small>{tr(`Last checked ${billing.fetchedAt ? new Date(billing.fetchedAt).toLocaleString() : '—'} · top up at openrouter.ai → Credits.`, `آخر فحص ${billing.fetchedAt ? new Date(billing.fetchedAt).toLocaleString('ar-LB') : '—'} · أعد الشحن من openrouter.ai ← Credits.`)}</small></p>
                </>
              ) : (
                <p className="muted">{tr('Press “Check balance now” to read the live remaining credit from OpenRouter.', 'اضغط «افحص الرصيد الآن» لقراءة الرصيد المتبقي مباشرة من OpenRouter.')}</p>
              )}
              <div className="chip-row">
                <button type="button" className="compact-button primary" disabled={balanceBusy} onClick={() => void refreshBalance()}>
                  {balanceBusy ? tr('Checking…', 'جارٍ الفحص…') : tr('Check balance now', 'افحص الرصيد الآن')}
                </button>
                <a className="compact-button" href="https://openrouter.ai/credits" target="_blank" rel="noreferrer">{tr('Top up', 'إعادة شحن')}</a>
              </div>
              {balanceError && <p className="form-error" role="alert">{balanceError}</p>}
            </article>

            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('How billing works', 'كيف تعمل الفوترة')}</p><h2>{tr('Where the money goes', 'أين تذهب التكلفة')}</h2></div></div>
              <ul className="signal-list">
                <li>{tr('AI answers are pay-as-you-go: every reply uses a small amount of prepaid OpenRouter credit (usually a fraction of a cent). The "Total cost" number on this page is exactly that usage.', 'إجابات الذكاء الاصطناعي بنظام الدفع حسب الاستخدام: كل رد يستهلك جزءاً صغيراً من رصيد OpenRouter المدفوع مسبقاً (عادة أجزاء من السنت). رقم «إجمالي التكلفة» في هذه الصفحة هو هذا الاستهلاك بالضبط.')}</li>
                <li>{tr('WhatsApp needs a monthly Whapi subscription — a fixed price, independent of how much the bot talks.', 'واتساب يحتاج اشتراك Whapi شهري — سعر ثابت لا يتأثر بكمية رسائل البوت.')}</li>
                <li>{tr('Everything else (server, database, dashboard, Telegram, Discord) currently runs on free plans, so the only recurring bills are OpenRouter top-ups and the Whapi subscription.', 'كل الباقي (الخادم وقاعدة البيانات ولوحة التحكم وتيليغرام وديسكورد) يعمل حالياً على خطط مجانية، لذا الفواتير المتكررة الوحيدة هي شحن OpenRouter واشتراك Whapi.')}</li>
              </ul>
            </article>

            <article className="panel span-two">
              <div className="section-heading"><div><p className="eyebrow">{tr('Subscriptions & services', 'الاشتراكات والخدمات')}</p><h2>{tr('Every service, labeled', 'كل خدمة باسمها')}</h2></div><small className="muted">{tr('Click a subscription price to set or correct it.', 'اضغط على سعر الاشتراك لتحديده أو تصحيحه.')}</small></div>
              <div className="data-list">
                {subscriptions.map((item) => {
                  const label = isArabic ? item.labelAr : item.labelEn;
                  const description = isArabic ? item.descriptionAr : item.descriptionEn;
                  const isEditing = editingCostKey === item.serviceKey;
                  const kindLabel = item.billingKind === 'USAGE' ? tr('Pay-as-you-go', 'حسب الاستخدام') : item.billingKind === 'SUBSCRIPTION' ? tr('Monthly subscription', 'اشتراك شهري') : tr('Free', 'مجاني');
                  const renewal = renewalNotice(item);
                  return (
                    <div key={item.serviceKey}>
                      <span>
                        <strong>{label}</strong>
                        <small>{description}{item.manageUrl && <> · <a href={item.manageUrl} target="_blank" rel="noreferrer">{tr('Manage', 'إدارة')}</a></>}</small>
                        {renewal && !isEditing && <small className={renewal.tone === 'negative' ? 'renewal-due' : undefined}>{renewal.text}</small>}
                        {isEditing && costError && <small className="renewal-due">{costError}</small>}
                      </span>
                      <span className="chip-row">
                        <span className={`status-pill ${item.billingKind === 'FREE' ? 'healthy' : renewal?.tone === 'negative' ? 'negative' : 'neutral'}`}>{kindLabel}</span>
                        {item.billingKind === 'USAGE' ? (
                          <b>{billing ? `${money(billing.monthSpendUsd)} ${tr('this month', 'هذا الشهر')}` : '—'}</b>
                        ) : isEditing ? (
                          <span className="chip-row">
                            <input
                              className="compact-select subscription-price-input"
                              inputMode="decimal"
                              value={editingCostValue}
                              onChange={(event) => setEditingCostValue(event.target.value)}
                              placeholder="0.00"
                              aria-label={tr('Monthly cost in USD', 'التكلفة الشهرية بالدولار')}
                            />
                            <input
                              className="compact-select subscription-date-input"
                              type="date"
                              value={editingRenewsOn}
                              onChange={(event) => setEditingRenewsOn(event.target.value)}
                              aria-label={tr('Next renewal date', 'تاريخ التجديد القادم')}
                              title={tr('Next renewal date', 'تاريخ التجديد القادم')}
                            />
                            <button type="button" className="compact-button primary" disabled={costBusy} onClick={() => void saveSubscription(item.serviceKey)}>{costBusy ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save', 'حفظ')}</button>
                            <button type="button" className="compact-button" disabled={costBusy} onClick={() => { setEditingCostKey(null); setCostError(''); }}>{tr('Cancel', 'إلغاء')}</button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="compact-button"
                            disabled={item.billingKind === 'FREE'}
                            onClick={() => startEditing(item)}
                          >
                            {item.billingKind === 'FREE' ? tr('$0 / month', '0$ / شهر') : item.monthlyCostUsd == null ? tr('Set price & date', 'حدد السعر والتاريخ') : `${money(item.monthlyCostUsd)} / ${tr('month', 'شهر')}`}
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
                {!subscriptions.length && <p className="muted">{tr('Service list is loading…', 'جارٍ تحميل قائمة الخدمات…')}</p>}
              </div>
            </article>
          </section>

          {noTelemetry && (
            <EmptyState
              title={tr('No provider usage recorded for this period', 'لم يتم تسجيل استخدام من المزوّد خلال هذه الفترة')}
              message={tr('Cost and usage appear only after real provider activity is recorded. No records does not mean zero cost. Try another period or refresh after new activity.', 'تظهر التكلفة والاستخدام فقط بعد تسجيل نشاط حقيقي من المزوّد. عدم وجود سجلات لا يعني أن التكلفة صفر. جرّب فترة أخرى أو حدّث بعد نشاط جديد.')}
              action={<div className="empty-state-actions"><button type="button" onClick={() => setDays(30)}>{tr('Show last 30 days', 'عرض آخر 30 يوماً')}</button><button type="button" className="primary" onClick={() => setReload((value) => value + 1)}>{tr('Refresh telemetry', 'تحديث البيانات')}</button></div>}
            />
          )}

          <section className="metric-grid analytics-metrics comparison-metrics">
            <article className="metric-card analytics-metric-card">
              <div className="metric-label-row"><span>{tr('Total cost', 'إجمالي التكلفة')}</span><span className="info-tip" tabIndex={0} data-tooltip={tr('Provider-reported spend for the selected period.', 'التكلفة التي أبلغ عنها المزوّد خلال الفترة المحددة.')}>?</span></div>
              <strong>{noTelemetry ? '—' : money(summary.costUsd)}</strong>
              <div className="metric-comparison"><Delta current={summary.costUsd} previous={previousSummary.costUsd} inverse tr={tr} /><small>{tr(`vs ${previousPeriodLabel}`, `مقابل ${previousPeriodLabel}`)}</small></div>
              <small>{noTelemetry ? tr('No verified provider telemetry', 'لا توجد بيانات مؤكدة من المزوّد') : `${money(summary.avgCostPerCall)} ${tr('average per call', 'متوسط لكل طلب')}`}</small>
            </article>

            <article className="metric-card analytics-metric-card">
              <div className="metric-label-row"><span>{tr('AI calls', 'طلبات الذكاء الاصطناعي')}</span><span className="info-tip" tabIndex={0} data-tooltip={tr('All provider calls recorded by the usage ledger.', 'كل طلبات المزوّد المسجلة في سجل الاستخدام.')}>?</span></div>
              <strong>{summary.totalCalls.toLocaleString()}</strong>
              <div className="metric-comparison"><Delta current={summary.totalCalls} previous={previousSummary.totalCalls} tr={tr} /><small>{tr(`vs ${previousPeriodLabel}`, `مقابل ${previousPeriodLabel}`)}</small></div>
              <small>{summary.successfulCalls.toLocaleString()} {tr('successful', 'ناجح')} · {summary.failedCalls.toLocaleString()} {tr('failed', 'فاشل')}</small>
            </article>

            <article className="metric-card analytics-metric-card">
              <div className="metric-label-row"><span>{tr('Total tokens', 'إجمالي الرموز')}</span><span className="info-tip" tabIndex={0} data-tooltip={tr('Input and output tokens combined.', 'مجموع رموز الإدخال والإخراج.')}>?</span></div>
              <strong>{noTelemetry ? '—' : summary.totalTokens.toLocaleString()}</strong>
              <div className="metric-comparison"><Delta current={summary.totalTokens} previous={previousSummary.totalTokens} tr={tr} /><small>{tr(`vs ${previousPeriodLabel}`, `مقابل ${previousPeriodLabel}`)}</small></div>
              <small>{noTelemetry ? tr('Waiting for provider usage', 'بانتظار بيانات الاستخدام') : `${summary.inputTokens.toLocaleString()} ${tr('input', 'إدخال')} · ${summary.outputTokens.toLocaleString()} ${tr('output', 'إخراج')}`}</small>
            </article>

            <article className="metric-card analytics-metric-card">
              <div className="metric-label-row"><span>{tr('Cache hit rate', 'نسبة التخزين المؤقت')}</span><span className="info-tip" tabIndex={0} data-tooltip={tr('Share of operations served from cache instead of a fresh model call.', 'نسبة العمليات التي استفادت من التخزين المؤقت بدلاً من طلب نموذج جديد.')}>?</span></div>
              <strong>{noTelemetry ? '—' : pct(summary.cacheHitRate)}</strong>
              <div className="metric-comparison"><Delta current={summary.cacheHitRate} previous={previousSummary.cacheHitRate} tr={tr} /><small>{tr(`vs ${previousPeriodLabel}`, `مقابل ${previousPeriodLabel}`)}</small></div>
              <small>{noTelemetry ? tr('No telemetry yet', 'لا توجد بيانات بعد') : `${summary.cacheHitCount.toLocaleString()} ${tr('cached operations', 'عملية مخزنة مؤقتاً')}`}</small>
            </article>
          </section>

          {!noTelemetry && (
            <section className="analytics-grid upgraded-analytics-grid">
              <article className="panel span-two analytics-trend-panel">
                <div className="section-heading"><div><p className="eyebrow">{tr('Daily cost', 'التكلفة اليومية')}</p><h2>{tr('Spend over time', 'الإنفاق مع الوقت')}</h2></div><span className="status-pill neutral">{money(summary.costUsd)}</span></div>
                {series.length ? <div className="cost-series analytics-cost-series">
                  {series.map((point) => <div className="cost-row" key={point.bucketDate} title={tr(`${point.calls} calls · ${point.totalTokens.toLocaleString()} tokens · ${money(point.costUsd)}`, `${point.calls} طلب · ${point.totalTokens.toLocaleString()} رمز · ${money(point.costUsd)}`)}>
                    <span>{new Date(`${point.bucketDate}T00:00:00`).toLocaleDateString(isArabic ? 'ar-LB' : undefined, { month: 'short', day: 'numeric' })}</span>
                    <div className="cost-bar-track"><i style={{ width: `${Math.max(2, (point.costUsd / maxDailyCost) * 100)}%` }} /></div>
                    <strong>{money(point.costUsd)}</strong><small>{point.calls} {tr('calls', 'طلبات')}</small>
                  </div>)}
                </div> : <p className="muted">{tr('No daily usage points were returned for this period.', 'لم يتم إرجاع نقاط استخدام يومية لهذه الفترة.')}</p>}
              </article>

              <article className="panel span-two cost-breakdown-panel">
                <div className="section-heading"><div><p className="eyebrow">{tr('Cost breakdown', 'تفصيل التكلفة')}</p><h2>{tr('Spend by purpose', 'التكلفة حسب الغرض')}</h2></div><small className="muted">{tr('Hover a bar for calls, tokens and cost.', 'مرّر المؤشر فوق الشريط لرؤية الطلبات والرموز والتكلفة.')}</small></div>
                {purposeRows.length ? <div className="purpose-cost-chart">{purposeRows.map(([purpose, item]) => {
                  const previous = previousSummary.byPurpose[purpose];
                  const share = summary.costUsd ? item.costUsd / summary.costUsd : 0;
                  return <div className="purpose-cost-row" key={purpose} title={tr(`${item.calls} calls · ${item.totalTokens.toLocaleString()} tokens · ${money(item.costUsd)}`, `${item.calls} طلب · ${item.totalTokens.toLocaleString()} رمز · ${money(item.costUsd)}`)}>
                    <div className="purpose-cost-label"><span><strong dir="ltr">{purpose.replaceAll('_', ' ')}</strong><small>{pct(share)} {tr('of spend', 'من التكلفة')}</small></span><span className="purpose-cost-values"><strong>{money(item.costUsd)}</strong><Delta current={item.costUsd} previous={previous?.costUsd ?? 0} inverse tr={tr} /></span></div>
                    <div className="purpose-bar-track"><i style={{ width: `${Math.max(3, (item.costUsd / maxPurposeCost) * 100)}%` }} /></div>
                  </div>;
                })}</div> : <p className="muted">{tr('No purpose-level telemetry yet.', 'لا توجد بيانات حسب الغرض بعد.')}</p>}
              </article>

              <article className="panel">
                <div className="section-heading"><div><p className="eyebrow">{tr('Platforms', 'المنصات')}</p><h2>{tr('Conversation activity', 'نشاط المحادثات')}</h2></div></div>
                {platforms.length ? <div className="data-list analytics-platform-list">{platforms.map((item) => (
                  <div key={item.platform} title={tr(`${item.messages.toLocaleString()} messages · ${item.aiResponses.toLocaleString()} AI replies · ${item.totalTokens.toLocaleString()} tokens`, `${item.messages.toLocaleString()} رسالة · ${item.aiResponses.toLocaleString()} رد AI · ${item.totalTokens.toLocaleString()} رمز`)}><span><strong className="capitalize" dir="ltr">{item.platform}</strong><small>{item.messages.toLocaleString()} {tr('messages', 'رسائل')} · {item.aiResponses.toLocaleString()} {tr('AI replies', 'ردود AI')}</small></span><b>{money(item.aiCostUsd)}</b></div>
                ))}</div> : <p className="muted">{tr('No platform activity for this period.', 'لا يوجد نشاط للمنصات خلال هذه الفترة.')}</p>}
              </article>

              <article className="panel provider-overview-panel">
                <div className="section-heading"><div><p className="eyebrow">{tr('Providers', 'المزودون')}</p><h2>{tr('Provider comparison', 'مقارنة المزودين')}</h2></div></div>
                {providerRows.length ? <div className="provider-summary-grid">{providerRows.map(([provider, item]) => {
                  const share = summary.costUsd ? item.cost / summary.costUsd : 0;
                  const successRate = item.calls ? item.success / item.calls : 0;
                  return <article key={provider} className="provider-summary-card" title={tr(`${item.calls} calls · ${item.tokens.toLocaleString()} tokens`, `${item.calls} طلب · ${item.tokens.toLocaleString()} رمز`)}><div><strong dir="ltr">{provider}</strong><span>{pct(share)} {tr('of spend', 'من التكلفة')}</span></div><b>{money(item.cost)}</b><small>{item.calls.toLocaleString()} {tr('calls', 'طلبات')} · {pct(successRate)} {tr('success', 'نجاح')}</small></article>;
                })}</div> : <p className="muted">{tr('No provider usage for this period.', 'لا يوجد استخدام للمزودين خلال هذه الفترة.')}</p>}
              </article>

              <article className="panel span-two analytics-model-panel">
                <div className="section-heading"><div><p className="eyebrow">{tr('Models', 'النماذج')}</p><h2>{tr('Model efficiency comparison', 'مقارنة كفاءة النماذج')}</h2><p className="muted model-table-intro">{tr('Compare volume, reliability and unit cost. Cost change is measured against the same model in the previous period.', 'قارن الحجم والموثوقية وتكلفة الوحدة. تتم مقارنة تغير التكلفة مع النموذج نفسه في الفترة السابقة.')}</p></div></div>
                {models.length ? <div className="table-wrap analytics-model-table"><table className="responsive-table"><thead><tr><th>{tr('Provider / model', 'المزوّد / النموذج')}</th><th>{tr('Calls', 'الطلبات')}</th><th>{tr('Tokens', 'الرموز')}</th><th>{tr('Success', 'النجاح')}</th><th>{tr('Avg / call', 'متوسط / طلب')}</th><th>{tr('Cost', 'التكلفة')}</th><th>{tr('vs previous', 'مقابل السابق')}</th></tr></thead><tbody>{models.map((item) => {
                  const previous = previousModelMap.get(`${item.provider}:${item.model}`);
                  const share = summary.costUsd ? item.costUsd / summary.costUsd : 0;
                  return (
                    <tr key={`${item.provider}:${item.model}`} title={tr(`${pct(share)} of total spend · ${item.cacheHitCount.toLocaleString()} cached operations`, `${pct(share)} من إجمالي التكلفة · ${item.cacheHitCount.toLocaleString()} عملية مخزنة`)}>
                      <td data-label={tr('Provider / model', 'المزوّد / النموذج')} dir="ltr"><strong>{item.model}</strong><small className="table-subtext">{item.provider} · {pct(share)} {tr('of spend', 'من التكلفة')}</small></td>
                      <td data-label={tr('Calls', 'الطلبات')}>{item.calls.toLocaleString()}</td>
                      <td data-label={tr('Tokens', 'الرموز')}>{item.totalTokens.toLocaleString()}</td>
                      <td data-label={tr('Success', 'النجاح')}>{pct(item.successRate)}</td>
                      <td data-label={tr('Avg / call', 'متوسط / طلب')}>{money(item.avgCostPerCall)}</td>
                      <td data-label={tr('Cost', 'التكلفة')}><strong>{money(item.costUsd)}</strong></td>
                      <td data-label={tr('vs previous', 'مقابل السابق')}><Delta current={item.costUsd} previous={previous?.costUsd ?? 0} inverse tr={tr} /></td>
                    </tr>
                  );
                })}</tbody></table></div> : <EmptyState title={tr('No model usage yet', 'لا يوجد استخدام للنماذج بعد')} message={tr('Model/provider comparison will appear after provider usage is logged.', 'ستظهر مقارنة النماذج والمزودين بعد تسجيل استخدام المزوّد.')} action={<button type="button" onClick={() => setReload((value) => value + 1)}>{tr('Refresh', 'تحديث')}</button>} />}
              </article>
            </section>
          )}
        </>
      )}
    </>
  );
}
