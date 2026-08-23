import { useEffect, useMemo, useState } from 'react';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { getAiUsageSummary, getAiUsageTimeseries, getModelUsage, getPlatformStats } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { AiUsageSeriesPoint, AiUsageSummary, ModelUsageStat, PlatformStat } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function AnalyticsPage() {
  const { tr, isArabic } = useLanguage();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<AiUsageSummary>();
  const [series, setSeries] = useState<AiUsageSeriesPoint[]>([]);
  const [platforms, setPlatforms] = useState<PlatformStat[]>([]);
  const [models, setModels] = useState<ModelUsageStat[]>([]);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError(false);
    setSummary(undefined);
    Promise.all([
      getAiUsageSummary(getSupabaseClient(), days),
      getAiUsageTimeseries(getSupabaseClient(), days),
      getPlatformStats(getSupabaseClient(), days),
      getModelUsage(getSupabaseClient(), days),
    ]).then(([nextSummary, nextSeries, nextPlatforms, nextModels]) => {
      if (!active) return;
      setSummary(nextSummary); setSeries(nextSeries); setPlatforms(nextPlatforms); setModels(nextModels);
    }).catch(() => active && setError(true));
    return () => { active = false; };
  }, [days, reload]);

  const maxDailyCost = useMemo(() => Math.max(...series.map((item) => item.costUsd), 0.000001), [series]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('AI telemetry', 'قياسات الذكاء الاصطناعي')}</p>
          <h1>{tr('Usage & cost', 'الاستخدام والتكلفة')}</h1>
          <p className="muted page-subtitle">{tr('Server-recorded model usage, tokens, cache activity, and spend.', 'استخدام النماذج والرموز والتخزين المؤقت والتكلفة كما يسجلها الخادم.')}</p>
        </div>
        <select className="compact-select" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label={tr('Analytics period', 'فترة التحليل')}>
          <option value={7}>{tr('Last 7 days', 'آخر 7 أيام')}</option><option value={30}>{tr('Last 30 days', 'آخر 30 يوماً')}</option><option value={90}>{tr('Last 90 days', 'آخر 90 يوماً')}</option>
        </select>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !summary ? (
        <LoadingState label={tr('Loading AI telemetry', 'جارٍ تحميل بيانات الذكاء الاصطناعي')} />
      ) : (
        <>
          <section className="metric-grid analytics-metrics">
            <article className="metric-card"><span>{tr('Total cost', 'إجمالي التكلفة')}</span><strong>{money(summary.costUsd)}</strong><small>{money(summary.avgCostPerCall)} {tr('average per call', 'متوسط لكل طلب')}</small></article>
            <article className="metric-card"><span>{tr('AI calls', 'طلبات الذكاء الاصطناعي')}</span><strong>{summary.totalCalls.toLocaleString()}</strong><small>{summary.successfulCalls.toLocaleString()} {tr('successful', 'ناجح')} · {summary.failedCalls.toLocaleString()} {tr('failed', 'فاشل')}</small></article>
            <article className="metric-card"><span>{tr('Total tokens', 'إجمالي الرموز')}</span><strong>{summary.totalTokens.toLocaleString()}</strong><small>{summary.inputTokens.toLocaleString()} {tr('input', 'إدخال')} · {summary.outputTokens.toLocaleString()} {tr('output', 'إخراج')}</small></article>
            <article className="metric-card"><span>{tr('Cache hit rate', 'نسبة التخزين المؤقت')}</span><strong>{pct(summary.cacheHitRate)}</strong><small>{summary.cacheHitCount.toLocaleString()} {tr('cached operations', 'عملية مخزنة مؤقتاً')}</small></article>
          </section>

          <section className="analytics-grid">
            <article className="panel span-two">
              <div className="section-heading"><div><p className="eyebrow">{tr('Daily cost', 'التكلفة اليومية')}</p><h2>{tr('Spend over time', 'الإنفاق مع الوقت')}</h2></div></div>
              {series.length ? <div className="cost-series">
                {series.map((point) => <div className="cost-row" key={point.bucketDate}>
                  <span>{new Date(`${point.bucketDate}T00:00:00`).toLocaleDateString(isArabic ? 'ar-LB' : undefined, { month: 'short', day: 'numeric' })}</span>
                  <div className="cost-bar-track"><i style={{ width: `${Math.max(2, (point.costUsd / maxDailyCost) * 100)}%` }} /></div>
                  <strong>{money(point.costUsd)}</strong><small>{point.calls} {tr('calls', 'طلبات')}</small>
                </div>)}
              </div> : <p className="muted">{tr('No AI usage has been logged for this period yet.', 'لم يتم تسجيل استخدام للذكاء الاصطناعي خلال هذه الفترة بعد.')}</p>}
            </article>

            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('By purpose', 'حسب الغرض')}</p><h2>{tr('Where AI spend happens', 'أين تُستهلك تكلفة الذكاء الاصطناعي')}</h2></div></div>
              {Object.keys(summary.byPurpose).length ? <div className="data-list">{Object.entries(summary.byPurpose).map(([purpose, item]) => (
                <div key={purpose}><span><strong dir="ltr">{purpose.replaceAll('_', ' ')}</strong><small>{item.calls} {tr('calls', 'طلبات')} · {item.totalTokens.toLocaleString()} {tr('tokens', 'رموز')}</small></span><b>{money(item.costUsd)}</b></div>
              ))}</div> : <p className="muted">{tr('No purpose-level telemetry yet.', 'لا توجد بيانات حسب الغرض بعد.')}</p>}
            </article>

            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('Platforms', 'المنصات')}</p><h2>{tr('Conversation activity', 'نشاط المحادثات')}</h2></div></div>
              {platforms.length ? <div className="data-list">{platforms.map((item) => (
                <div key={item.platform}><span><strong className="capitalize" dir="ltr">{item.platform}</strong><small>{item.messages.toLocaleString()} {tr('messages', 'رسائل')} · {item.aiResponses.toLocaleString()} {tr('AI replies', 'ردود AI')}</small></span><b>{money(item.aiCostUsd)}</b></div>
              ))}</div> : <p className="muted">{tr('No platform activity for this period.', 'لا يوجد نشاط للمنصات خلال هذه الفترة.')}</p>}
            </article>

            <article className="panel span-two">
              <div className="section-heading"><div><p className="eyebrow">{tr('Models', 'النماذج')}</p><h2>{tr('Provider usage', 'استخدام مزوّدي النماذج')}</h2></div></div>
              {models.length ? <div className="table-wrap"><table><thead><tr><th>{tr('Provider / model', 'المزوّد / النموذج')}</th><th>{tr('Calls', 'الطلبات')}</th><th>{tr('Tokens', 'الرموز')}</th><th>{tr('Success', 'النجاح')}</th><th>{tr('Cost', 'التكلفة')}</th></tr></thead><tbody>{models.map((item) => (
                <tr key={`${item.provider}:${item.model}`}><td dir="ltr"><strong>{item.model}</strong><small className="table-subtext">{item.provider}</small></td><td>{item.calls.toLocaleString()}</td><td>{item.totalTokens.toLocaleString()}</td><td>{pct(item.successRate)}</td><td>{money(item.costUsd)}</td></tr>
              ))}</tbody></table></div> : <p className="muted">{tr('No model telemetry has been logged yet. n8n must call log_ai_usage_event after provider requests.', 'لم يتم تسجيل بيانات استخدام النماذج بعد. يجب أن يستدعي n8n الدالة log_ai_usage_event بعد طلبات مزوّد النموذج.')}</p>}
            </article>
          </section>
        </>
      )}
    </>
  );
}
