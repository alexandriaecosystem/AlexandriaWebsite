import { useEffect, useMemo, useState } from 'react';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useToast } from '../components/Feedback';
import { getCommunityPlatformStats, type CommunityPlatformStats } from '../services/community-dashboard';
import { getDashboardMetrics, getPlatformStats, listDeadLetterOperations, retryDeadLetterOperation } from '../services/admin';
import { getSupabaseClient } from '../services/supabase';
import type { DashboardMetrics, DeadLetterOperation, PlatformStat } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';

const platformOrder = ['telegram', 'whatsapp', 'discord', 'x', 'instagram'] as const;

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function platformLabel(platform: string) {
  if (platform === 'x') return 'X';
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

export function OperationsPage() {
  const { tr } = useLanguage();
  const { notify } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [deadLetters, setDeadLetters] = useState<DeadLetterOperation[]>([]);
  const [platformStats, setPlatformStats] = useState<PlatformStat[]>([]);
  const [communityStats, setCommunityStats] = useState<CommunityPlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    setLoading(true);
    setError(false);

    Promise.all([
      getDashboardMetrics(client),
      listDeadLetterOperations(client),
    ]).then(([nextMetrics, nextDeadLetters]) => {
      if (!active) return;
      setMetrics(nextMetrics);
      setDeadLetters(nextDeadLetters);
    }).catch(() => active && setError(true)).finally(() => active && setLoading(false));

    void getPlatformStats(client, 7).then((value) => active && setPlatformStats(value)).catch(() => active && setPlatformStats([]));
    void getCommunityPlatformStats(client).then((value) => active && setCommunityStats(value)).catch(() => active && setCommunityStats(null));

    return () => { active = false; };
  }, [reload]);

  const platformRows = useMemo(() => {
    const telemetry = new Map(platformStats.map((item) => [item.platform.toLowerCase(), item]));
    const verification = new Map((communityStats?.platforms ?? []).map((item) => [item.platform.toLowerCase(), item]));

    return platformOrder.map((platform) => {
      const activity = telemetry.get(platform);
      const membership = verification.get(platform);
      const verified = membership?.verificationConnected === true;
      const observed = (activity?.messages ?? 0) > 0;
      return {
        platform,
        messages: activity?.messages ?? 0,
        aiResponses: activity?.aiResponses ?? 0,
        verified,
        observed,
        lastVerifiedAt: membership?.lastVerifiedAt ?? null,
      };
    });
  }, [platformStats, communityStats]);

  const activeSignals = platformRows.filter((item) => item.verified || item.observed).length;
  const failedOperations = metrics?.failedOperations ?? deadLetters.length;

  async function retryOperation(eventId: string) {
    if (retryingId) return;
    setRetryingId(eventId);
    try {
      await retryDeadLetterOperation(getSupabaseClient(), eventId);
      notify({
        tone: 'success',
        title: tr('Retry queued', 'تمت جدولة إعادة المحاولة'),
        message: tr('The failed operation was returned to the backend queue.', 'تمت إعادة العملية الفاشلة إلى قائمة المعالجة الخلفية.'),
      });
      setReload((value) => value + 1);
    } catch (caught) {
      notify({
        tone: 'error',
        title: tr('Retry failed', 'فشلت إعادة المحاولة'),
        message: caught instanceof Error ? caught.message : tr('The operation could not be retried.', 'تعذر إعادة محاولة العملية.'),
      });
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Operations', 'العمليات')}</p>
          <h1>{tr('System & integrations', 'النظام والتكاملات')}</h1>
          <p className="muted page-subtitle">{tr('Review real backend failure signals, platform activity and community verification without exposing platform credentials in the browser.', 'راجع إشارات الأعطال الفعلية ونشاط المنصات والتحقق من المجتمع من دون كشف بيانات اعتماد المنصات في المتصفح.')}</p>
        </div>
        <button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading}>{tr('Refresh status', 'تحديث الحالة')}</button>
      </header>

      {error ? <RetryableErrorState onRetry={() => setReload((value) => value + 1)} /> : loading || !metrics ? (
        <LoadingState label={tr('Loading operational status', 'جارٍ تحميل الحالة التشغيلية')} />
      ) : (
        <>
          <section className="metric-grid" aria-label={tr('Operational summary', 'الملخص التشغيلي')}>
            <article className="metric-card">
              <span>{tr('Failed operations', 'العمليات الفاشلة')}</span>
              <strong>{failedOperations.toLocaleString()}</strong>
              <small>{failedOperations ? tr('Needs administrator attention', 'تحتاج إلى متابعة المسؤول') : tr('No backend dead letters reported', 'لا توجد عمليات خلفية متوقفة')}</small>
            </article>
            <article className="metric-card">
              <span>{tr('Dead-letter queue', 'قائمة العمليات المتوقفة')}</span>
              <strong>{deadLetters.length.toLocaleString()}</strong>
              <small>{tr('Operations eligible for administrator review', 'عمليات متاحة لمراجعة المسؤول')}</small>
            </article>
            <article className="metric-card">
              <span>{tr('Platform signals', 'إشارات المنصات')}</span>
              <strong>{activeSignals}/{platformRows.length}</strong>
              <small>{tr('Verified connections or traffic observed in the last 7 days', 'اتصالات متحقق منها أو نشاط مرصود خلال آخر 7 أيام')}</small>
            </article>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr('Platform status', 'حالة المنصات')}</p>
                <h2>{tr('Evidence-based integration signals', 'إشارات تكامل مبنية على بيانات فعلية')}</h2>
                <p className="muted">{tr('Telegram, Discord and WhatsApp can expose membership verification. X and Instagram are shown from recent message telemetry because credential connectivity is intentionally server-only.', 'يمكن لـ Telegram وDiscord وWhatsApp إظهار تحقق العضوية. أما X وInstagram فيتم عرضهما من بيانات الرسائل الحديثة لأن حالة بيانات الاعتماد تبقى على الخادم فقط.')}</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="responsive-table">
                <thead><tr><th>{tr('Platform', 'المنصة')}</th><th>{tr('Signal', 'الإشارة')}</th><th>{tr('Messages · 7d', 'الرسائل · 7 أيام')}</th><th>{tr('AI replies · 7d', 'ردود الذكاء الاصطناعي · 7 أيام')}</th><th>{tr('Last verification', 'آخر تحقق')}</th></tr></thead>
                <tbody>
                  {platformRows.map((item) => {
                    const status = item.verified
                      ? tr('Verified connected', 'اتصال متحقق منه')
                      : item.observed
                        ? tr('Traffic observed', 'تم رصد نشاط')
                        : tr('No recent telemetry', 'لا توجد بيانات حديثة');
                    const tone = item.verified ? 'healthy' : item.observed ? 'positive' : 'neutral';
                    return <tr key={item.platform}>
                      <td data-label={tr('Platform', 'المنصة')}><span className={`platform ${item.platform}`}>{platformLabel(item.platform)}</span></td>
                      <td data-label={tr('Signal', 'الإشارة')}><span className={`status-pill ${tone}`}>{status}</span></td>
                      <td data-label={tr('Messages · 7d', 'الرسائل · 7 أيام')}><strong>{item.messages.toLocaleString()}</strong></td>
                      <td data-label={tr('AI replies · 7d', 'ردود الذكاء الاصطناعي · 7 أيام')}><strong>{item.aiResponses.toLocaleString()}</strong></td>
                      <td data-label={tr('Last verification', 'آخر تحقق')}>{formatDate(item.lastVerifiedAt)}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="table-card mobile-card-table">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr('Failure queue', 'قائمة الأعطال')}</p>
                <h2>{tr('Dead-letter operations', 'العمليات المتوقفة')}</h2>
                <p className="muted">{tr('Retry only after reviewing the recorded error. Retrying returns the item to the backend queue; it does not hide the original failure.', 'أعد المحاولة فقط بعد مراجعة الخطأ المسجل. إعادة المحاولة تعيد العنصر إلى قائمة المعالجة الخلفية ولا تخفي العطل الأصلي.')}</p>
              </div>
              <span className={`status-pill ${deadLetters.length ? 'negative' : 'healthy'}`}>{deadLetters.length}</span>
            </div>
            <div className="table-scroll">
              <table className="responsive-table">
                <thead><tr><th>{tr('Operation', 'العملية')}</th><th>{tr('Aggregate', 'الكيان')}</th><th>{tr('Attempts', 'المحاولات')}</th><th>{tr('Last error', 'آخر خطأ')}</th><th>{tr('Updated', 'آخر تحديث')}</th><th /></tr></thead>
                <tbody>
                  {deadLetters.map((item) => <tr key={item.id}>
                    <td data-label={tr('Operation', 'العملية')}><strong>{item.eventType}</strong><small className="table-subtext mono">{item.id.slice(0, 8)}…</small></td>
                    <td data-label={tr('Aggregate', 'الكيان')}><strong>{item.aggregateType}</strong><small className="table-subtext mono">{item.aggregateId}</small></td>
                    <td data-label={tr('Attempts', 'المحاولات')}>{item.attemptCount.toLocaleString()}</td>
                    <td data-label={tr('Last error', 'آخر خطأ')} className="error-cell">{item.lastError || tr('No error text recorded', 'لم يتم تسجيل نص للخطأ')}</td>
                    <td data-label={tr('Updated', 'آخر تحديث')}>{formatDate(item.updatedAt)}</td>
                    <td data-label="" className="table-action"><button type="button" disabled={Boolean(retryingId)} onClick={() => void retryOperation(item.id)}>{retryingId === item.id ? tr('Retrying…', 'جارٍ إعادة المحاولة…') : tr('Retry', 'إعادة المحاولة')}</button></td>
                  </tr>)}
                  {!deadLetters.length && <tr><td colSpan={6} className="empty-row">{tr('No failed operations are waiting for review.', 'لا توجد عمليات فاشلة بانتظار المراجعة.')}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
