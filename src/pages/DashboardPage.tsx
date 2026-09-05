import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics, listKnowledgeDocuments } from '../services/admin';
import { listKnowledgeGaps } from '../services/admin-operations';
import { getCommunityPlatformStats, type CommunityPlatform, type CommunityPlatformStats } from '../services/community-dashboard';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { CommunityPieChart } from '../components/CommunityPieChart';
import { useLanguage } from '../i18n/LanguageContext';
import '../dashboard-chart.css';

const platformOrder: CommunityPlatform[] = ['TELEGRAM', 'DISCORD', 'WHATSAPP'];

export function DashboardPage() {
  const { tr } = useLanguage();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [failedKnowledge, setFailedKnowledge] = useState(0);
  const [openGaps, setOpenGaps] = useState(0);
  const [communityStats, setCommunityStats] = useState<CommunityPlatformStats | null>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    setCommunityStats(undefined);
    getDashboardMetrics(getSupabaseClient()).then(setMetrics).catch(() => setError(true));
    void listKnowledgeDocuments(getSupabaseClient(), 'FAILED').then((result) => setFailedKnowledge(result.total)).catch(() => undefined);
    void listKnowledgeGaps(getSupabaseClient(), 'OPEN').then((result) => setOpenGaps(result.total)).catch(() => undefined);
    void getCommunityPlatformStats(getSupabaseClient()).then(setCommunityStats).catch(() => setCommunityStats(null));
  }, [reload]);

  const attentionCount = (metrics?.pendingReviews ?? 0) + failedKnowledge + openGaps + (metrics?.failedOperations ?? 0);
  const failedOperations = metrics?.failedOperations ?? 0;
  const activeRate = metrics && metrics.totalUsers > 0 ? Math.round((metrics.activeUsers / metrics.totalUsers) * 100) : 0;
  const inactiveUsers = metrics ? Math.max(0, metrics.totalUsers - metrics.activeUsers) : 0;
  const platformStats = platformOrder.map((platform) => communityStats?.platforms.find((item) => item.platform === platform) ?? {
    platform,
    knownUsers: 0,
    premiumUsers: 0,
    generalMembers: 0,
    vipMembers: 0,
    verifiedMembers: 0,
    lastVerifiedAt: null,
    verificationConnected: false,
  });
  const maxPlatformUsers = Math.max(1, ...platformStats.map((item) => item.knownUsers));

  return (
    <>
      <header className="page-header hero-header">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">{tr('Dashboard', 'لوحة التحكم')}</p>
          <h1>{tr('Alexandria community', 'مجتمع Alexandria')}</h1>
          <p className="muted page-subtitle">
            {tr(
              'See what needs attention, jump to common tasks, and track community health at a glance.',
              'شاهد ما يحتاج إلى متابعة، وانتقل إلى المهام الشائعة، وتابع حالة المجتمع بنظرة سريعة.',
            )}
          </p>
        </div>
        <Link className={`status-pill ${metrics ? (failedOperations === 0 ? 'healthy' : 'negative') : 'neutral'}`} to="/operations">
          <span className="pill-dot" /> {metrics ? (failedOperations === 0 ? tr('No failed operations', 'لا توجد عمليات فاشلة') : tr(`${failedOperations} failed operations`, `${failedOperations} عمليات فاشلة`)) : tr('Checking status', 'جارٍ التحقق من الحالة')}
        </Link>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !metrics ? (
        <LoadingState label={tr('Loading dashboard', 'جارٍ تحميل لوحة التحكم')} />
      ) : (
        <>
          <section className="dashboard-quick-actions" aria-label={tr('Quick actions', 'إجراءات سريعة')}>
            <Link to="/knowledge"><strong>{tr('Knowledge base', 'قاعدة المعرفة')}</strong><small>{tr('Upload and manage knowledge', 'رفع وإدارة المعرفة')}</small></Link>
            <Link to="/reviews"><strong>{tr('Review members', 'مراجعة الأعضاء')}</strong><small>{tr(`${metrics.pendingReviews} pending`, `${metrics.pendingReviews} معلّق`)}</small></Link>
            <Link to="/announcements"><strong>{tr('Create announcement', 'إنشاء إعلان')}</strong><small>{tr('Draft community updates', 'صياغة تحديثات المجتمع')}</small></Link>
            <Link to="/messages"><strong>{tr('Open messages', 'فتح الرسائل')}</strong><small>{tr('Check conversations and takeover', 'مراجعة المحادثات والتدخل البشري')}</small></Link>
          </section>

          <div className="dashboard-summary-row">
            <section className="metric-grid dashboard-essential-metrics" aria-label={tr('Community summary', 'ملخص المجتمع')}>
              <Link className="metric-card metric-link" to="/users">
                <span>{tr('Total users', 'إجمالي المستخدمين')}</span>
                <strong>{metrics.totalUsers.toLocaleString()}</strong>
                <small>{tr('Known community users', 'المستخدمون المعروفون في المجتمع')}</small>
              </Link>
              <Link className="metric-card metric-link" to="/users">
                <span>{tr('Active users', 'المستخدمون النشطون')}</span>
                <strong>{metrics.activeUsers.toLocaleString()}</strong>
                <small>{activeRate}% {tr('of total users active', 'من إجمالي المستخدمين نشطون')}</small>
              </Link>
              <Link className="metric-card metric-link" to="/community">
                <span>{tr('Approved members', 'الأعضاء المقبولون')}</span>
                <strong>{metrics.approvedUsers.toLocaleString()}</strong>
                <small>{tr('Manage approved community', 'إدارة المجتمع المعتمد')}</small>
              </Link>
            </section>

            <section className="panel dashboard-activity-panel" aria-label={tr('User activity distribution', 'توزيع نشاط المستخدمين')}>
              <div className="section-heading dashboard-activity-heading">
                <div>
                  <p className="eyebrow">{tr('Engagement', 'التفاعل')}</p>
                  <h2>{tr('User activity', 'نشاط المستخدمين')}</h2>
                </div>
                <Link className="inline-link" to="/users">{tr('View users', 'عرض المستخدمين')} →</Link>
              </div>
              <CommunityPieChart
                compact
                label={tr('Users', 'المستخدمون')}
                general={metrics.activeUsers}
                vip={inactiveUsers}
                generalLabel={tr('Active', 'نشط')}
                vipLabel={tr('Inactive', 'غير نشط')}
              />
              <p className="dashboard-activity-note">
                <strong>{activeRate}% {tr('active', 'نشط')}</strong>
                <span>{tr('Share of known users currently active.', 'نسبة المستخدمين المعروفين النشطين حالياً.')}</span>
              </p>
            </section>
          </div>

          <section className="panel attention-panel dashboard-attention-panel">
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
              <Link to="/operations"><span>{tr('Failed operations', 'العمليات الفاشلة')}</span><strong>{failedOperations}</strong><small>{tr('review delivery issues', 'مراجعة مشكلات الإرسال')}</small></Link>
            </div>
          </section>

          <section className="panel community-membership-panel dashboard-platform-panel" aria-label={tr('Users by platform', 'المستخدمون حسب المنصة')}>
            <div className="section-heading">
              <div>
                <h2>{tr('Users by platform', 'المستخدمون حسب المنصة')}</h2>
                <p className="muted">{tr('Compare known users directly across Telegram, Discord and WhatsApp.', 'قارن المستخدمين المعروفين مباشرة عبر Telegram وDiscord وWhatsApp.')}</p>
              </div>
              <Link className="inline-link" to="/users">{tr('View users', 'عرض المستخدمين')} →</Link>
            </div>

            {communityStats === undefined ? (
              <div className="community-membership-loading">{tr('Loading platform distribution…', 'جارٍ تحميل توزيع المنصات…')}</div>
            ) : communityStats === null ? (
              <div className="community-membership-unavailable" role="status">
                <strong>{tr('Platform distribution is temporarily unavailable', 'توزيع المنصات غير متاح مؤقتاً')}</strong>
                <span>{tr('Your core user totals are still available above.', 'لا تزال أرقام المستخدمين الأساسية متاحة أعلاه.')}</span>
              </div>
            ) : (
              <div className="platform-comparison" role="img" aria-label={platformStats.map((item) => `${item.platform} ${item.knownUsers}`).join(', ')}>
                {platformStats.map((item) => (
                  <div className={`platform-comparison-row ${item.platform.toLowerCase()}`} key={item.platform}>
                    <div className="platform-comparison-label">
                      <strong>{item.platform.charAt(0) + item.platform.slice(1).toLowerCase()}</strong>
                      <span>{item.knownUsers.toLocaleString()}</span>
                    </div>
                    <div className="platform-comparison-track" aria-hidden="true">
                      <i style={{ width: `${(item.knownUsers / maxPlatformUsers) * 100}%` }} />
                    </div>
                    <small>
                      {item.platform === 'TELEGRAM' && item.premiumUsers > 0
                        ? tr(`${item.premiumUsers.toLocaleString()} Premium`, `${item.premiumUsers.toLocaleString()} Premium`)
                        : tr('Known users', 'مستخدمون معروفون')}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}