import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics } from '../services/admin';
import { listKnowledgeGaps } from '../services/admin-operations';
import { getDashboardAttention, type DashboardAttention } from '../services/dashboard-attention';
import { classifyAiSleepWindow, listAiSleepWindows } from '../services/ai-sleep';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { CommunityPieChart } from '../components/CommunityPieChart';
import { useLanguage } from '../i18n/LanguageContext';
import { MemberCompositionChart } from '../components/MemberCompositionChart';
import { getMemberComposition, type MemberComposition } from '../services/member-composition';
import '../dashboard-chart.css';
import '../dashboard-usability.css';


export function DashboardPage() {
  const { tr } = useLanguage();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [openGaps, setOpenGaps] = useState<number | null>(null);
  const [attention, setAttention] = useState<DashboardAttention | null>(null);
  const [activeTakeovers, setActiveTakeovers] = useState<number | null>(null);
  const [checksPending, setChecksPending] = useState(true);
  const [composition, setComposition] = useState<MemberComposition | null>(null);
  const [compositionPending, setCompositionPending] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    const client = getSupabaseClient();
    setError(false);
    setChecksPending(true);
    setOpenGaps(null);
    setAttention(null);
    setActiveTakeovers(null);
    setComposition(null);
    setCompositionPending(true);
    void getMemberComposition(client).then((value) => { if (current) setComposition(value); }).catch(() => {}).finally(() => { if (current) setCompositionPending(false); });
    void getDashboardMetrics(client).then((value) => { if (current) setMetrics(value); }).catch(() => { if (current) setError(true); });
    void Promise.allSettled([
      listKnowledgeGaps(client, 'OPEN').then((result) => { if (current) setOpenGaps(result.total); }),
      getDashboardAttention(client).then((result) => { if (current) setAttention(result); }),
      listAiSleepWindows(client, { limit: 100 }).then((result) => {
        if (current) setActiveTakeovers(result.items.filter((item) => classifyAiSleepWindow(item, new Date()) === 'ACTIVE').length);
      }),
    ]).then(() => { if (current) setChecksPending(false); });
    return () => { current = false; };
  }, [reload]);

  const activeMembers = metrics && metrics.activeUsers7Days != null
    ? Math.min(metrics.totalUsers, Math.max(0, metrics.activeUsers7Days)) : null;
  const inactiveMembers = metrics && activeMembers != null ? Math.max(0, metrics.totalUsers - activeMembers) : 0;
  const incompleteChecks = openGaps == null || attention == null || activeTakeovers == null;

  const attentionItems = metrics ? [
    { count: metrics.pendingReviews, to: '/reviews', title: tr('Pending member reviews', 'مراجعات أعضاء معلقة'), detail: tr('Review applications waiting for a decision.', 'راجع الطلبات التي تنتظر قرارًا.') },
    { count: attention?.knowledgeConflicts ?? 0, to: '/knowledge', title: tr('Knowledge conflicts', 'تعارضات المعرفة'), detail: tr('Review contradictions blocking trusted knowledge.', 'راجع التعارضات التي تمنع اعتماد المعرفة.') },
    { count: openGaps, to: '/knowledge-gaps', title: tr('Knowledge gaps', 'فجوات المعرفة'), detail: tr('Add trusted answers for questions the assistant could not answer.', 'أضف إجابات موثوقة للأسئلة التي لم يتمكن المساعد من الإجابة عنها.') },
    { count: attention?.failedAnnouncements ?? 0, to: '/announcements', title: tr('Failed announcements', 'إعلانات فشل إرسالها'), detail: tr('Review announcement deliveries that need attention.', 'راجع عمليات إرسال الإعلانات التي تحتاج إلى متابعة.') },
    { count: activeTakeovers, to: '/community', title: tr('Human Takeover Active', 'التحكم البشري نشط'), detail: tr('AI replies are paused in one or more communities.', 'ردود الذكاء الاصطناعي متوقفة في مجتمع واحد أو أكثر.') },
  ].filter((item) => item.count != null && item.count > 0) : [];

  return <>
    <header className="page-header hero-header dashboard-simple-header">
      <div className="dashboard-hero-copy">
        <p className="eyebrow">{tr('Dashboard', 'لوحة التحكم')}</p>
        <h1>{tr('Alexandria community', 'مجتمع Alexandria')}</h1>
        <p className="muted page-subtitle">{tr('See member activity and the few things that need your attention.', 'شاهد نشاط الأعضاء والأمور القليلة التي تحتاج إلى متابعتك.')}</p>
      </div>
    </header>

    {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((value) => value + 1); }} /> : !metrics ? (
      <LoadingState label={tr('Loading dashboard', 'جارٍ تحميل لوحة التحكم')} />
    ) : <>
      <section className="metric-grid dashboard-essential-metrics dashboard-summary-metrics" aria-label={tr('Community summary', 'ملخص المجتمع')}>
        <Link className="metric-card metric-link" to="/users"><span>{tr('Total Members', 'إجمالي الأعضاء')}</span><strong>{metrics.totalUsers.toLocaleString()}</strong><small>{tr('Known Alexandria members', 'أعضاء Alexandria المعروفون')}</small></Link>
        <Link className="metric-card metric-link" to="/users"><span>{tr('Active Members', 'الأعضاء النشطون')}</span><strong>{activeMembers?.toLocaleString() ?? '—'}</strong><small>{tr('Interacted in the last 7 days', 'تفاعلوا خلال آخر 7 أيام')}</small></Link>
        <Link className="metric-card metric-link" to="/reviews"><span>{tr('Pending Reviews', 'المراجعات المعلقة')}</span><strong>{metrics.pendingReviews.toLocaleString()}</strong><small>{tr('Waiting for an admin decision', 'بانتظار قرار المشرف')}</small></Link>
        <Link className="metric-card metric-link" to="/knowledge-gaps"><span>{tr('Knowledge Gaps', 'فجوات المعرفة')}</span><strong>{openGaps?.toLocaleString() ?? '—'}</strong><small>{tr('Unanswered questions to improve', 'أسئلة غير مجابة لتحسينها')}</small></Link>
      </section>

      <div className="dashboard-visual-grid">
      <section className="panel dashboard-activity-panel" aria-label={tr('Member activity over the last 7 days', 'نشاط الأعضاء خلال آخر 7 أيام')}>
        <div className="section-heading dashboard-activity-heading"><div><p className="eyebrow">{tr('Community activity', 'نشاط المجتمع')}</p><h2>{tr('Active vs inactive members', 'الأعضاء النشطون مقابل غير النشطين')}</h2></div><Link className="inline-link" to="/users">{tr('View members', 'عرض الأعضاء')} →</Link></div>
        {activeMembers == null ? <p role="status" className="muted">{tr('Activity data is unavailable', 'بيانات النشاط غير متاحة')}</p> : <div className="dashboard-activity-simple">
          <CommunityPieChart compact label={tr('Members', 'الأعضاء')} general={activeMembers} vip={inactiveMembers} generalLabel={tr('Active', 'نشط')} vipLabel={tr('Inactive', 'غير نشط')} />
          <div className="dashboard-activity-definition">
            <strong>{tr('How activity is calculated', 'كيف يتم حساب النشاط')}</strong>
            <p>{tr('Active means a member has at least one processed message in the last 7 days. Inactive means no processed message in that same 7-day window.', 'نشط يعني أن العضو لديه رسالة واحدة معالجة على الأقل خلال آخر 7 أيام. غير نشط يعني عدم وجود رسالة معالجة خلال الفترة نفسها.')}</p>
            <small>{tr(`${activeMembers?.toLocaleString() ?? '—'} of ${metrics.totalUsers.toLocaleString()} members were active in the last 7 days.`, `كان ${activeMembers?.toLocaleString() ?? '—'} من أصل ${metrics.totalUsers.toLocaleString()} عضوًا نشطين خلال آخر 7 أيام.`)}</small>
          </div>
        </div>}
      </section>

      <section className="panel" aria-label={tr('Platform accounts', 'حسابات المنصات')}>
        <div className="section-heading"><div><p className="eyebrow">{tr('Where members connect', 'أين يتواصل الأعضاء')}</p><h2>{tr('Platform accounts', 'حسابات المنصات')}</h2></div></div>
        {composition ? <MemberCompositionChart data={composition} /> : <div role="status"><p className="muted">{compositionPending ? tr('Loading account composition…', 'جارٍ تحميل توزيع الحسابات…') : tr('Account composition is unavailable.', 'توزيع الحسابات غير متاح.')}</p>{!compositionPending && <button type="button" className="compact-button" onClick={() => setReload((value) => value + 1)}>{tr('Try again', 'حاول مرة أخرى')}</button>}</div>}
      </section>
      </div>

      <section className="panel dashboard-attention-panel">
        <div className="section-heading"><div><p className="eyebrow">{tr('Needs attention', 'يحتاج إلى متابعة')}</p><h2>{incompleteChecks ? tr('Checks need attention', 'الفحوصات تحتاج إلى متابعة') : attentionItems.length ? tr('Items waiting for you', 'عناصر بانتظارك') : tr('Nothing urgent right now', 'لا يوجد شيء عاجل حاليًا')}</h2></div><span className={`status-pill ${incompleteChecks ? 'neutral' : attentionItems.length ? 'negative' : 'positive'}`}>{incompleteChecks ? '—' : attentionItems.length}</span></div>
        {attentionItems.length ? <div className="attention-grid dashboard-action-alerts">{attentionItems.map((item) => <Link key={item.title} to={item.to}><span>{item.title}</span><strong>{item.count}</strong><small>{item.detail}</small></Link>)}</div> : !incompleteChecks && <div className="dashboard-all-clear"><strong>{tr('All clear', 'كل شيء واضح')}</strong><span>{tr('There are no admin actions requiring attention right now.', 'لا توجد إجراءات إدارية تحتاج إلى متابعة الآن.')}</span></div>}
        {incompleteChecks && <div className="dashboard-partial" role="status"><strong>{checksPending ? tr('Checking community status…', 'جارٍ التحقق من حالة المجتمع…') : tr('Some checks are unavailable', 'بعض الفحوصات غير متاحة')}</strong><p className="muted">{tr('Missing information is not counted as zero. Retry to see whether action is needed.', 'لا تُحسب المعلومات المفقودة كصفر. أعد المحاولة لمعرفة ما يحتاج إلى متابعة.')}</p><button type="button" className="compact-button" disabled={checksPending} onClick={() => setReload((value) => value + 1)}>{tr('Refresh checks', 'تحديث الفحوصات')}</button></div>}
      </section>
    </>}
  </>;
}
