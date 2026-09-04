import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics, listKnowledgeDocuments } from '../services/admin';
import { listKnowledgeGaps } from '../services/admin-operations';
import { getCommunityPlatformStats, type CommunityPlatform, type CommunityPlatformStats } from '../services/community-dashboard';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { PlatformUsersPieChart } from '../components/CommunityPieChart';
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

  return (
    <>
      <header className="page-header hero-header">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">{tr('Dashboard', 'لوحة التحكم')}</p>
          <h1>{tr('Alexandria community', 'مجتمع Alexandria')}</h1>
          <p className="muted page-subtitle">
            {tr(
              'Review pending items and keep up with your community.',
              'راجع العناصر المعلّقة وتابع نشاط مجتمعك.',
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
          <section className="metric-grid dashboard-essential-metrics" aria-label={tr('Community summary', 'ملخص المجتمع')}>
            <Link className="metric-card metric-link" to="/users">
              <span>{tr('Total users', 'إجمالي المستخدمين')}</span>
              <strong>{metrics.totalUsers.toLocaleString()}</strong>
              <small>{tr('Known community users', 'المستخدمون المعروفون في المجتمع')}</small>
            </Link>
            <Link className="metric-card metric-link" to="/users">
              <span>{tr('Active users', 'المستخدمون النشطون')}</span>
              <strong>{metrics.activeUsers.toLocaleString()}</strong>
              <small>{metrics.blockedUsers.toLocaleString()} {tr('blocked', 'محظور')}</small>
            </Link>
            <Link className="metric-card metric-link" to="/community">
              <span>{tr('Approved members', 'الأعضاء المقبولون')}</span>
              <strong>{metrics.approvedUsers.toLocaleString()}</strong>
              <small>{tr('Manage approved community', 'إدارة المجتمع المعتمد')}</small>
            </Link>
          </section>

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
                <p className="muted">{tr('Known users across Telegram, Discord and WhatsApp, with Telegram Premium highlighted.', 'المستخدمون المعروفون عبر Telegram وDiscord وWhatsApp، مع إبراز مستخدمي Telegram Premium.')}</p>
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
              <div className="community-platform-distribution dashboard-platform-chart">
                <PlatformUsersPieChart
                  telegram={platformStats[0].knownUsers}
                  telegramPremium={platformStats[0].premiumUsers}
                  discord={platformStats[1].knownUsers}
                  whatsapp={platformStats[2].knownUsers}
                  label={tr('Users by platform', 'المستخدمون حسب المنصة')}
                />
              </div>
            )}
          </section>


        </>
      )}
    </>
  );
}
