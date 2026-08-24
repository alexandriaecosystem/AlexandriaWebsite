import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics } from '../services/admin';
import { getSystemHealth, listKnowledgeGaps, type SystemHealth } from '../services/admin-operations';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function DashboardPage() {
  const { tr } = useLanguage();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [health, setHealth] = useState<SystemHealth>();
  const [openGaps, setOpenGaps] = useState(0);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    getDashboardMetrics(getSupabaseClient()).then(setMetrics).catch(() => setError(true));
    void getSystemHealth(getSupabaseClient()).then(setHealth).catch(() => undefined);
    void listKnowledgeGaps(getSupabaseClient(), 'OPEN').then((result) => setOpenGaps(result.total)).catch(() => undefined);
  }, [reload]);

  const usageTrackingMissing = Boolean(
    metrics && metrics.aiResponses > 0 && metrics.inputTokens === 0 && metrics.outputTokens === 0 && metrics.aiCostTotal === 0
  );

  const attentionCount = (metrics?.pendingReviews ?? 0) + (health?.outboxDeadLetter ?? 0) + (health?.knowledgeFailed ?? 0) + openGaps;

  return (
    <>
      <header className="page-header hero-header">
        <div>
          <p className="eyebrow">{tr('Dashboard', 'لوحة التحكم')}</p>
          <h1>{tr('Alexandria community', 'مجتمع Alexandria')}</h1>
          <p className="muted page-subtitle">{tr('See what needs attention first, then monitor community activity, knowledge, operations and AI spend.', 'ابدأ بما يحتاج إلى متابعة ثم راقب نشاط المجتمع والمعرفة والعمليات وتكلفة الذكاء الاصطناعي.')}</p>
        </div>
        <span className="status-pill healthy"><span className="pill-dot" /> {tr('Live', 'مباشر')}</span>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !metrics ? (
        <LoadingState label={tr('Loading dashboard', 'جارٍ تحميل لوحة التحكم')} />
      ) : (
        <>
          <section className="panel attention-panel">
            <div className="section-heading">
              <div><p className="eyebrow">{tr('Needs attention', 'يحتاج إلى متابعة')}</p><h2>{attentionCount ? tr('Admin actions waiting', 'إجراءات إدارية بانتظارك') : tr('Nothing urgent right now', 'لا يوجد شيء عاجل حالياً')}</h2></div>
              <span className={`status-pill ${attentionCount ? 'negative' : 'positive'}`}>{attentionCount}</span>
            </div>
            <div className="attention-grid">
              <Link to="/reviews"><span>{tr('Member reviews', 'مراجعة الأعضاء')}</span><strong>{metrics.pendingReviews}</strong><small>{tr('waiting for decision', 'بانتظار القرار')}</small></Link>
              <Link to="/knowledge"><span>{tr('Knowledge failures', 'أخطاء المعرفة')}</span><strong>{health?.knowledgeFailed ?? 0}</strong><small>{tr('documents need attention', 'مستند يحتاج للمتابعة')}</small></Link>
              <Link to="/knowledge-gaps"><span>{tr('Knowledge gaps', 'فجوات المعرفة')}</span><strong>{openGaps}</strong><small>{tr('unresolved questions', 'أسئلة غير محلولة')}</small></Link>
              <Link to="/failed-operations"><span>{tr('Failed operations', 'العمليات الفاشلة')}</span><strong>{health?.outboxDeadLetter ?? metrics.failedOperations}</strong><small>{tr('jobs need inspection', 'عمليات تحتاج للفحص')}</small></Link>
            </div>
          </section>

          {usageTrackingMissing && (
            <section className="panel" role="status" style={{ marginBottom: 18 }}>
              <div className="section-heading"><div><p className="eyebrow">{tr('AI cost telemetry', 'قياس تكلفة الذكاء الاصطناعي')}</p><h2>{tr('Spend tracking is not receiving provider usage yet', 'تتبّع التكلفة لا يستقبل بيانات الاستخدام من المزوّد بعد')}</h2></div><span className="status-pill negative">{tr('Tracking incomplete', 'التتبّع غير مكتمل')}</span></div>
              <p className="muted">{tr('AI replies have been recorded, but provider token and cost events have not reached the usage ledger yet. The $0 value is not treated as a verified spend total.', 'تم تسجيل ردود للذكاء الاصطناعي لكن بيانات الرموز والتكلفة لم تصل بعد إلى سجل الاستخدام. لذلك لا تعتبر قيمة 0$ إجمالي تكلفة مؤكداً.')}</p>
              <Link className="inline-link" to="/analytics">{tr('Open AI telemetry', 'فتح قياسات الذكاء الاصطناعي')} →</Link>
            </section>
          )}

          <section className="metric-grid" aria-label={tr('Community summary', 'ملخص المجتمع')}>
            <article className="metric-card"><span>{tr('Total users', 'إجمالي المستخدمين')}</span><strong>{metrics.totalUsers.toLocaleString()}</strong><small>{metrics.approvedUsers.toLocaleString()} {tr('approved members', 'عضو مقبول')}</small></article>
            <article className="metric-card"><span>{tr('Active users', 'المستخدمون النشطون')}</span><strong>{metrics.activeUsers.toLocaleString()}</strong><small>{metrics.blockedUsers.toLocaleString()} {tr('blocked', 'محظور')}</small></article>
            <Link className="metric-card metric-link" to="/messages"><span>{tr('Messages', 'الرسائل')}</span><strong>{metrics.totalMessages.toLocaleString()}</strong><small>{metrics.messagesToday.toLocaleString()} {tr('today', 'اليوم')} · {metrics.messagesLast7Days.toLocaleString()} {tr('last 7 days', 'آخر 7 أيام')}</small></Link>
            <Link className="metric-card metric-link" to="/analytics"><span>{tr('AI spend', 'تكلفة الذكاء الاصطناعي')}</span><strong>{usageTrackingMissing ? '—' : money(metrics.aiCostTotal)}</strong><small>{usageTrackingMissing ? tr('Waiting for provider usage telemetry', 'بانتظار بيانات الاستخدام من المزوّد') : `${money(metrics.aiCost30Days)} ${tr('last 30 days', 'آخر 30 يوماً')}`}</small></Link>
            <Link className="metric-card metric-link" to="/community"><span>{tr('Approved members', 'الأعضاء المقبولون')}</span><strong>{metrics.approvedUsers.toLocaleString()}</strong><small>{tr('Open community access', 'فتح دخول المجتمع')}</small></Link>
            <article className="metric-card"><span>{tr('Answers reused', 'إجابات أُعيد استخدامها')}</span><strong>{metrics.cachedResponses.toLocaleString()}</strong><small>{percent(metrics.cacheHitRate)} {tr('of responses reused approved stored answers', 'من الردود استخدمت إجابات مخزنة ومعتمدة')}</small></article>
          </section>

          <section className="dashboard-grid">
            <article className="panel"><div className="section-heading"><div><p className="eyebrow">{tr('Last 30 days', 'آخر 30 يوماً')}</p><h2>{tr('Community activity', 'نشاط المجتمع')}</h2></div></div><div className="mini-stat-row"><span>{tr('Messages', 'الرسائل')}</span><strong>{metrics.messagesLast30Days.toLocaleString()}</strong></div><div className="mini-stat-row"><span>{tr('AI replies', 'ردود الذكاء الاصطناعي')}</span><strong>{metrics.aiResponses.toLocaleString()}</strong></div><div className="mini-stat-row"><span>{tr('Approved members', 'الأعضاء المقبولون')}</span><strong>{metrics.approvedUsers.toLocaleString()}</strong></div><div className="mini-stat-row"><span>{tr('AI spend', 'تكلفة الذكاء الاصطناعي')}</span><strong>{usageTrackingMissing ? '—' : money(metrics.aiCost30Days)}</strong></div><Link className="inline-link" to="/analytics">{tr('View AI & cost details', 'عرض تفاصيل الذكاء الاصطناعي والتكلفة')} →</Link></article>
            <article className="panel quick-actions-panel"><div className="section-heading"><div><p className="eyebrow">{tr('Quick actions', 'إجراءات سريعة')}</p><h2>{tr('What would you like to do?', 'ماذا تريد أن تفعل؟')}</h2></div></div><div className="quick-actions"><Link to="/reviews"><span>{tr('Review members', 'مراجعة الأعضاء')}</span><small>{tr('Approve or decline pending members', 'قبول أو رفض الأعضاء المعلّقين')}</small><b>→</b></Link><Link to="/knowledge"><span>{tr('Add knowledge', 'إضافة معرفة')}</span><small>{tr('Upload and manage project documents', 'رفع وإدارة مستندات المشروع')}</small><b>→</b></Link><Link to="/system-health"><span>{tr('Check system health', 'فحص صحة النظام')}</span><small>{tr('Inspect failures and recent platform activity', 'افحص الأخطاء ونشاط المنصات')}</small><b>→</b></Link><Link to="/announcements"><span>{tr('Post announcement', 'نشر إعلان')}</span><small>{tr('Choose Telegram, Discord, or WhatsApp', 'اختر Telegram أو Discord أو WhatsApp')}</small><b>→</b></Link></div></article>
          </section>
        </>
      )}
    </>
  );
}
