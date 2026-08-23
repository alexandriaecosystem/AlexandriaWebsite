import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getDashboardMetrics } from '../services/admin';
import type { DashboardMetrics } from '../types/contracts';
import { LoadingState, RetryableErrorState } from '../components/AsyncState';
import { useLanguage } from '../i18n/LanguageContext';

const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export function DashboardPage() {
  const { tr } = useLanguage();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError(false);
    getDashboardMetrics(getSupabaseClient()).then(setMetrics).catch(() => setError(true));
  }, [reload]);

  return (
    <>
      <header className="page-header hero-header">
        <div>
          <p className="eyebrow">{tr('Dashboard', 'لوحة التحكم')}</p>
          <h1>{tr('Alexandria community', 'مجتمع Alexandria')}</h1>
          <p className="muted page-subtitle">{tr('See member activity, reviews, announcements, knowledge, and AI spending in one place.', 'تابع نشاط الأعضاء والمراجعات والإعلانات والمعرفة وتكلفة الذكاء الاصطناعي من مكان واحد.')}</p>
        </div>
        <span className="status-pill healthy"><span className="pill-dot" /> {tr('Live', 'مباشر')}</span>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !metrics ? (
        <LoadingState label={tr('Loading dashboard', 'جارٍ تحميل لوحة التحكم')} />
      ) : (
        <>
          <section className="metric-grid" aria-label={tr('Community summary', 'ملخص المجتمع')}>
            <article className="metric-card"><span>{tr('Total users', 'إجمالي المستخدمين')}</span><strong>{metrics.totalUsers.toLocaleString()}</strong><small>{metrics.approvedUsers.toLocaleString()} {tr('approved members', 'عضو مقبول')}</small></article>
            <article className="metric-card"><span>{tr('Active users', 'المستخدمون النشطون')}</span><strong>{metrics.activeUsers.toLocaleString()}</strong><small>{metrics.blockedUsers.toLocaleString()} {tr('blocked', 'محظور')}</small></article>
            <article className="metric-card"><span>{tr('Messages', 'الرسائل')}</span><strong>{metrics.totalMessages.toLocaleString()}</strong><small>{metrics.messagesToday.toLocaleString()} {tr('today', 'اليوم')} · {metrics.messagesLast7Days.toLocaleString()} {tr('last 7 days', 'آخر 7 أيام')}</small></article>
            <Link className="metric-card metric-link" to="/analytics"><span>{tr('AI spend', 'تكلفة الذكاء الاصطناعي')}</span><strong>{money(metrics.aiCostTotal)}</strong><small>{money(metrics.aiCost30Days)} {tr('last 30 days', 'آخر 30 يوماً')}</small></Link>
            <Link className="metric-card metric-link" to="/reviews"><span>{tr('Members to review', 'أعضاء للمراجعة')}</span><strong>{metrics.pendingReviews.toLocaleString()}</strong><small>{metrics.pendingReviews ? tr('Waiting for your decision', 'بانتظار قرارك') : tr('Nothing waiting', 'لا توجد طلبات معلّقة')}</small></Link>
            <article className="metric-card"><span>{tr('Answers reused', 'إجابات أُعيد استخدامها')}</span><strong>{metrics.cachedResponses.toLocaleString()}</strong><small>{percent(metrics.cacheHitRate)} {tr('of responses reused approved stored answers', 'من الردود استخدمت إجابات مخزنة ومعتمدة')}</small></article>
          </section>

          <section className="dashboard-grid">
            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('Last 30 days', 'آخر 30 يوماً')}</p><h2>{tr('Community activity', 'نشاط المجتمع')}</h2></div></div>
              <div className="mini-stat-row"><span>{tr('Messages', 'الرسائل')}</span><strong>{metrics.messagesLast30Days.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>{tr('AI replies', 'ردود الذكاء الاصطناعي')}</span><strong>{metrics.aiResponses.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>{tr('Approved members', 'الأعضاء المقبولون')}</span><strong>{metrics.approvedUsers.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>{tr('AI spend', 'تكلفة الذكاء الاصطناعي')}</span><strong>{money(metrics.aiCost30Days)}</strong></div>
              <Link className="inline-link" to="/analytics">{tr('View AI & cost details', 'عرض تفاصيل الذكاء الاصطناعي والتكلفة')} →</Link>
            </article>

            <article className="panel quick-actions-panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('Quick actions', 'إجراءات سريعة')}</p><h2>{tr('What would you like to do?', 'ماذا تريد أن تفعل؟')}</h2></div></div>
              <div className="quick-actions">
                <Link to="/reviews"><span>{tr('Review members', 'مراجعة الأعضاء')}</span><small>{tr('Approve or decline pending members', 'قبول أو رفض الأعضاء المعلّقين')}</small><b aria-hidden="true">→</b></Link>
                <Link to="/knowledge"><span>{tr('Add knowledge', 'إضافة معرفة')}</span><small>{tr('Upload and manage project documents', 'رفع وإدارة مستندات المشروع')}</small><b aria-hidden="true">→</b></Link>
                <Link to="/announcements"><span>{tr('Post announcement', 'نشر إعلان')}</span><small>{tr('Choose Telegram, Discord, or WhatsApp', 'اختر Telegram أو Discord أو WhatsApp')}</small><b aria-hidden="true">→</b></Link>
                <Link to="/analytics"><span>{tr('View AI costs', 'عرض تكلفة الذكاء الاصطناعي')}</span><small>{tr('See usage and spending trends', 'عرض الاستخدام واتجاهات التكلفة')}</small><b aria-hidden="true">→</b></Link>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}
