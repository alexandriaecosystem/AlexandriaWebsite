import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics, listKnowledgeDocuments } from '../services/admin';
import { getMessageTimeseries, listKnowledgeGaps, type MessageSeriesPoint } from '../services/admin-operations';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';
import '../dashboard-chart.css';

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;

export function DashboardPage() {
  const { tr, isArabic } = useLanguage();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [failedKnowledge, setFailedKnowledge] = useState(0);
  const [openGaps, setOpenGaps] = useState(0);
  const [messageSeries, setMessageSeries] = useState<MessageSeriesPoint[]>([]);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    getDashboardMetrics(getSupabaseClient()).then(setMetrics).catch(() => setError(true));
    void listKnowledgeDocuments(getSupabaseClient(), 'FAILED').then((result) => setFailedKnowledge(result.total)).catch(() => undefined);
    void listKnowledgeGaps(getSupabaseClient(), 'OPEN').then((result) => setOpenGaps(result.total)).catch(() => undefined);
    void getMessageTimeseries(getSupabaseClient(), 30).then(setMessageSeries).catch(() => setMessageSeries([]));
  }, [reload]);

  const usageTrackingMissing = Boolean(
    metrics && metrics.aiResponses > 0 && metrics.inputTokens === 0 && metrics.outputTokens === 0 && metrics.aiCostTotal === 0
  );

  const attentionCount = (metrics?.pendingReviews ?? 0) + failedKnowledge + openGaps;
  const maxDailyMessages = Math.max(1, ...messageSeries.map((point) => point.messages));
  const chartTotal = messageSeries.reduce((sum, point) => sum + point.messages, 0);
  const chartAverage = messageSeries.length ? chartTotal / messageSeries.length : 0;

  return (
    <>
      <header className="page-header hero-header">
        <div>
          <p className="eyebrow">{tr('Dashboard', 'لوحة التحكم')}</p>
          <h1>{tr('Alexandria community', 'مجتمع Alexandria')}</h1>
          <p className="muted page-subtitle">{tr('Review community activity, content and costs from one place.', 'راجع نشاط المجتمع والمحتوى والتكاليف من مكان واحد.')}</p>
        </div>
        <span className="status-pill healthy"><span className="pill-dot" /> {tr('Live', 'مباشر')}</span>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !metrics ? (
        <LoadingState label={tr('Loading dashboard', 'جارٍ تحميل لوحة التحكم')} />
      ) : (
        <>
          <section className="panel attention-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr('Needs attention', 'يحتاج إلى متابعة')}</p>
                <h2>{attentionCount ? tr('Items waiting for you', 'عناصر بانتظارك') : tr('Nothing urgent right now', 'لا يوجد شيء عاجل حالياً')}</h2>
              </div>
              <span className={`status-pill ${attentionCount ? 'negative' : 'positive'}`}>{attentionCount}</span>
            </div>
            <div className="attention-grid">
              <Link to="/reviews"><span>{tr('Member reviews', 'مراجعة الأعضاء')}</span><strong>{metrics.pendingReviews}</strong><small>{tr('waiting for decision', 'بانتظار القرار')}</small></Link>
              <Link to="/knowledge"><span>{tr('Knowledge documents', 'مستندات المعرفة')}</span><strong>{failedKnowledge}</strong><small>{tr('need attention', 'تحتاج إلى متابعة')}</small></Link>
              <Link to="/knowledge-gaps"><span>{tr('Knowledge gaps', 'فجوات المعرفة')}</span><strong>{openGaps}</strong><small>{tr('unresolved questions', 'أسئلة غير محلولة')}</small></Link>
            </div>
          </section>

          {usageTrackingMissing && (
            <section className="panel" role="status" style={{ marginBottom: 18 }}>
              <div className="section-heading">
                <div><p className="eyebrow">{tr('AI spend', 'تكلفة الذكاء الاصطناعي')}</p><h2>{tr('Cost tracking needs setup', 'تتبّع التكلفة يحتاج إلى إعداد')}</h2></div>
                <span className="status-pill neutral">{tr('Setup needed', 'يلزم الإعداد')}</span>
              </div>
              <p className="muted">{tr('AI replies are working, but accurate provider costs are not being recorded yet.', 'ردود الذكاء الاصطناعي تعمل، لكن التكلفة الدقيقة من المزوّد لا يتم تسجيلها بعد.')}</p>
              <Link className="inline-link" to="/analytics">{tr('View AI costs', 'عرض تكلفة الذكاء الاصطناعي')} →</Link>
            </section>
          )}

          <section className="metric-grid" aria-label={tr('Community summary', 'ملخص المجتمع')}>
            <article className="metric-card"><span>{tr('Total users', 'إجمالي المستخدمين')}</span><strong>{metrics.totalUsers.toLocaleString()}</strong><small>{metrics.approvedUsers.toLocaleString()} {tr('approved members', 'عضو مقبول')}</small></article>
            <article className="metric-card"><span>{tr('Active users', 'المستخدمون النشطون')}</span><strong>{metrics.activeUsers.toLocaleString()}</strong><small>{metrics.blockedUsers.toLocaleString()} {tr('blocked', 'محظور')}</small></article>
            <Link className="metric-card metric-link" to="/messages"><span>{tr('Messages', 'الرسائل')}</span><strong>{metrics.totalMessages.toLocaleString()}</strong><small>{metrics.messagesToday.toLocaleString()} {tr('today', 'اليوم')} · {metrics.messagesLast7Days.toLocaleString()} {tr('last 7 days', 'آخر 7 أيام')}</small></Link>
            <Link className="metric-card metric-link" to="/analytics"><span>{tr('AI spend', 'تكلفة الذكاء الاصطناعي')}</span><strong>{usageTrackingMissing ? '—' : money(metrics.aiCostTotal)}</strong><small>{usageTrackingMissing ? tr('Cost tracking setup needed', 'يلزم إعداد تتبّع التكلفة') : `${money(metrics.aiCost30Days)} ${tr('last 30 days', 'آخر 30 يوماً')}`}</small></Link>
            <Link className="metric-card metric-link" to="/community"><span>{tr('Approved members', 'الأعضاء المقبولون')}</span><strong>{metrics.approvedUsers.toLocaleString()}</strong><small>{tr('Manage approved community', 'إدارة المجتمع المعتمد')}</small></Link>
          </section>

          <section className="panel dashboard-chart-panel" aria-label={tr('Messages trend', 'اتجاه الرسائل')}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{tr('Last 30 days', 'آخر 30 يوماً')}</p>
                <h2>{tr('Messages trend', 'اتجاه الرسائل')}</h2>
                <p className="muted">{tr('Daily private messages processed by the community assistant.', 'الرسائل الخاصة اليومية التي عالجها مساعد المجتمع.')}</p>
              </div>
              <div className="dashboard-chart-summary">
                <strong>{chartTotal.toLocaleString()}</strong>
                <small>{tr('total · daily avg', 'إجمالي · متوسط يومي')} {chartAverage.toFixed(1)}</small>
              </div>
            </div>

            {messageSeries.length ? (
              <div className="message-bar-chart">
                {messageSeries.map((point, index) => {
                  const height = point.messages === 0 ? 2 : Math.max(5, (point.messages / maxDailyMessages) * 100);
                  const parsed = new Date(`${point.bucketDate}T00:00:00`);
                  const shortDate = parsed.toLocaleDateString(isArabic ? 'ar-LB' : undefined, { month: 'short', day: 'numeric' });
                  const showLabel = index === 0 || index === messageSeries.length - 1 || index % 5 === 0;
                  return (
                    <div className="message-bar-column" key={point.bucketDate} data-tooltip={`${shortDate}: ${point.messages} ${tr('messages', 'رسالة')}`}>
                      <div className="message-bar" style={{ height: `${height}%` }} />
                      {showLabel && <span className="message-bar-label">{shortDate}</span>}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="message-chart-empty">{tr('No message trend data is available yet.', 'لا تتوفر بيانات لاتجاه الرسائل بعد.')}</p>
            )}
          </section>

          <section className="panel quick-actions-panel" style={{ marginTop: 16 }}>
            <div className="section-heading"><div><p className="eyebrow">{tr('Quick actions', 'إجراءات سريعة')}</p><h2>{tr('Common admin tasks', 'مهام الإدارة الشائعة')}</h2></div></div>
            <div className="quick-actions">
              <Link to="/reviews"><span>{tr('Review members', 'مراجعة الأعضاء')}</span><small>{tr('Approve or decline pending members', 'قبول أو رفض الأعضاء المعلّقين')}</small><b>→</b></Link>
              <Link to="/knowledge"><span>{tr('Manage knowledge', 'إدارة المعرفة')}</span><small>{tr('Upload, edit and approve project documents', 'رفع وتعديل واعتماد مستندات المشروع')}</small><b>→</b></Link>
              <Link to="/announcements"><span>{tr('Post announcement', 'نشر إعلان')}</span><small>{tr('Send to Telegram, Discord or WhatsApp', 'إرسال إلى Telegram أو Discord أو WhatsApp')}</small><b>→</b></Link>
              <Link to="/token-monitor"><span>{tr('View token activity', 'عرض نشاط التوكن')}</span><small>{tr('Review recent on-chain transfers', 'مراجعة التحويلات الأخيرة على السلسلة')}</small><b>→</b></Link>
            </div>
          </section>
        </>
      )}
    </>
  );
}
