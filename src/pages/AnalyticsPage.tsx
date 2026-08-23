import { useEffect, useMemo, useState } from 'react';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { getAiUsageSummary, getAiUsageTimeseries, getModelUsage, getPlatformStats } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { AiUsageSeriesPoint, AiUsageSummary, ModelUsageStat, PlatformStat } from '../types/contracts';

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function AnalyticsPage() {
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
          <p className="eyebrow">AI telemetry</p>
          <h1>Usage & cost</h1>
          <p className="muted page-subtitle">Server-recorded model usage, tokens, cache activity, and spend.</p>
        </div>
        <select className="compact-select" value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Analytics period">
          <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !summary ? (
        <LoadingState label="Loading AI telemetry" />
      ) : (
        <>
          <section className="metric-grid analytics-metrics">
            <article className="metric-card"><span>Total cost</span><strong>{money(summary.costUsd)}</strong><small>{money(summary.avgCostPerCall)} average per call</small></article>
            <article className="metric-card"><span>AI calls</span><strong>{summary.totalCalls.toLocaleString()}</strong><small>{summary.successfulCalls.toLocaleString()} successful · {summary.failedCalls.toLocaleString()} failed</small></article>
            <article className="metric-card"><span>Total tokens</span><strong>{summary.totalTokens.toLocaleString()}</strong><small>{summary.inputTokens.toLocaleString()} input · {summary.outputTokens.toLocaleString()} output</small></article>
            <article className="metric-card"><span>Cache hit rate</span><strong>{pct(summary.cacheHitRate)}</strong><small>{summary.cacheHitCount.toLocaleString()} cached operations</small></article>
          </section>

          <section className="analytics-grid">
            <article className="panel span-two">
              <div className="section-heading"><div><p className="eyebrow">Daily cost</p><h2>Spend over time</h2></div></div>
              {series.length ? <div className="cost-series">
                {series.map((point) => <div className="cost-row" key={point.bucketDate}>
                  <span>{new Date(`${point.bucketDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                  <div className="cost-bar-track"><i style={{ width: `${Math.max(2, (point.costUsd / maxDailyCost) * 100)}%` }} /></div>
                  <strong>{money(point.costUsd)}</strong><small>{point.calls} calls</small>
                </div>)}
              </div> : <p className="muted">No AI usage has been logged for this period yet.</p>}
            </article>

            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">By purpose</p><h2>Where AI spend happens</h2></div></div>
              {Object.keys(summary.byPurpose).length ? <div className="data-list">{Object.entries(summary.byPurpose).map(([purpose, item]) => (
                <div key={purpose}><span><strong>{purpose.replaceAll('_', ' ')}</strong><small>{item.calls} calls · {item.totalTokens.toLocaleString()} tokens</small></span><b>{money(item.costUsd)}</b></div>
              ))}</div> : <p className="muted">No purpose-level telemetry yet.</p>}
            </article>

            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">Platforms</p><h2>Conversation activity</h2></div></div>
              {platforms.length ? <div className="data-list">{platforms.map((item) => (
                <div key={item.platform}><span><strong className="capitalize">{item.platform}</strong><small>{item.messages.toLocaleString()} messages · {item.aiResponses.toLocaleString()} AI replies</small></span><b>{money(item.aiCostUsd)}</b></div>
              ))}</div> : <p className="muted">No platform activity for this period.</p>}
            </article>

            <article className="panel span-two">
              <div className="section-heading"><div><p className="eyebrow">Models</p><h2>Provider usage</h2></div></div>
              {models.length ? <div className="table-wrap"><table><thead><tr><th>Provider / model</th><th>Calls</th><th>Tokens</th><th>Success</th><th>Cost</th></tr></thead><tbody>{models.map((item) => (
                <tr key={`${item.provider}:${item.model}`}><td><strong>{item.model}</strong><small className="table-subtext">{item.provider}</small></td><td>{item.calls.toLocaleString()}</td><td>{item.totalTokens.toLocaleString()}</td><td>{pct(item.successRate)}</td><td>{money(item.costUsd)}</td></tr>
              ))}</tbody></table></div> : <p className="muted">No model telemetry has been logged yet. n8n must call <code>log_ai_usage_event</code> after provider requests.</p>}
            </article>
          </section>
        </>
      )}
    </>
  );
}
