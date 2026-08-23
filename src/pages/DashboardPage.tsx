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
          <p className="eyebrow">{tr('Operations & analytics', 'العمليات والتحليلات')}</p>
          <h1>{tr('Community overview', 'نظرة عامة على المجتمع')}</h1>
          <p className="muted page-subtitle">{tr('Live membership, messaging, AI usage, review, and delivery health from Supabase.', 'بيانات مباشرة عن الأعضاء والرسائل واستخدام الذكاء الاصطناعي والمراجعات وحالة التسليم من Supabase.')}</p>
        </div>
        <span className="status-pill healthy"><span className="pill-dot" /> {tr('Admin verified', 'تم التحقق من المسؤول')}</span>
      </header>

      {error ? <RetryableErrorState onRetry={() => { setError(false); setReload((n) => n + 1); }} /> : !metrics ? (
        <LoadingState label={tr('Loading community metrics', 'جارٍ تحميل مؤشرات المجتمع')} />
      ) : (
        <>
          <section className="metric-grid" aria-label={tr('Community metrics', 'مؤشرات المجتمع')}>
            <article className="metric-card"><span>{tr('Total users', 'إجمالي المستخدمين')}</span><strong>{metrics.totalUsers.toLocaleString()}</strong><small>{metrics.activeUsers.toLocaleString()} {tr('active', 'نشط')} · {metrics.approvedUsers.toLocaleString()} {tr('approved', 'مقبول')}</small></article>
            <article className="metric-card"><span>{tr('Total messages', 'إجمالي الرسائل')}</span><strong>{metrics.totalMessages.toLocaleString()}</strong><small>{metrics.messagesToday.toLocaleString()} {tr('today', 'اليوم')} · {metrics.messagesLast7Days.toLocaleString()} {tr('last 7 days', 'آخر 7 أيام')}</small></article>
            <Link className="metric-card metric-link" to="/analytics"><span>{tr('AI cost', 'تكلفة الذكاء الاصطناعي')}</span><strong>{money(metrics.aiCostTotal)}</strong><small>{money(metrics.aiCostToday)} {tr('today', 'اليوم')} · {money(metrics.aiCost30Days)} {tr('last 30 days', 'آخر 30 يوماً')}</small></Link>
            <Link className="metric-card metric-link" to="/reviews"><span>{tr('Pending reviews', 'المراجعات المعلّقة')}</span><strong>{metrics.pendingReviews.toLocaleString()}</strong><small>{metrics.pendingReviews ? tr('Human decisions required', 'تحتاج إلى قرار من المسؤول') : tr('Queue is clear', 'قائمة الانتظار فارغة')}</small></Link>
            <article className="metric-card"><span>{tr('AI responses', 'ردود الذكاء الاصطناعي')}</span><strong>{metrics.aiResponses.toLocaleString()}</strong><small>{metrics.cachedResponses.toLocaleString()} {tr('cached', 'مخزّن مؤقتاً')} · {percent(metrics.cacheHitRate)} {tr('cache rate', 'نسبة التخزين المؤقت')}</small></article>
            <Link className={`metric-card metric-link ${metrics.failedOperations ? 'metric-danger' : ''}`} to="/dead-letter"><span>{tr('Failed operations', 'العمليات الفاشلة')}</span><strong>{metrics.failedOperations.toLocaleString()}</strong><small>{metrics.failedOperations ? tr('Needs manual attention', 'تحتاج إلى متابعة يدوية') : tr('No dead-letter work', 'لا توجد عمليات فاشلة')}</small></Link>
          </section>

          <section className="dashboard-grid">
            <article className="panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('30-day activity', 'نشاط آخر 30 يوماً')}</p><h2>{tr('Messaging footprint', 'نشاط الرسائل')}</h2></div></div>
              <div className="mini-stat-row"><span>{tr('Messages, 30 days', 'الرسائل خلال 30 يوماً')}</span><strong>{metrics.messagesLast30Days.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>{tr('Input tokens', 'رموز الإدخال')}</span><strong>{metrics.inputTokens.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>{tr('Output tokens', 'رموز الإخراج')}</span><strong>{metrics.outputTokens.toLocaleString()}</strong></div>
              <div className="mini-stat-row"><span>{tr('Blocked users', 'المستخدمون المحظورون')}</span><strong>{metrics.blockedUsers.toLocaleString()}</strong></div>
              <Link className="inline-link" to="/analytics">{tr('Open AI usage analytics', 'فتح تحليلات استخدام الذكاء الاصطناعي')} →</Link>
            </article>

            <article className="panel quick-actions-panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('Shortcuts', 'اختصارات')}</p><h2>{tr('Common actions', 'إجراءات شائعة')}</h2></div></div>
              <div className="quick-actions">
                <Link to="/reviews"><span>{tr('Review applicants', 'مراجعة المتقدمين')}</span><small>{tr('Process the pending queue', 'معالجة قائمة الانتظار')}</small><b aria-hidden="true">→</b></Link>
                <Link to="/knowledge"><span>{tr('Manage knowledge base', 'إدارة قاعدة المعرفة')}</span><small>{tr('Upload and approve project sources', 'رفع واعتماد مصادر المشروع')}</small><b aria-hidden="true">→</b></Link>
                <Link to="/announcements"><span>{tr('Create announcement', 'إنشاء إعلان')}</span><small>{tr('Draft or approve a broadcast', 'إنشاء مسودة أو اعتماد بث')}</small><b aria-hidden="true">→</b></Link>
                <Link to="/dead-letter"><span>{tr('Check failed operations', 'فحص العمليات الفاشلة')}</span><small>{tr('Retry terminal outbox events', 'إعادة محاولة أحداث الإرسال النهائية')}</small><b aria-hidden="true">→</b></Link>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
}
