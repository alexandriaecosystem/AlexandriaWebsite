import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAiUsageSummary, getDashboardMetrics } from '../services/admin';
import {
  getActivityFeed,
  getSystemHealth,
  listAdminUsers,
  listApprovedCommunity,
  listKnowledgeGaps,
  updateKnowledgeGapStatus,
  type ActivityItem,
  type AdminUserItem,
  type ApprovedCommunityItem,
  type KnowledgeGap,
  type SystemHealth,
} from '../services/admin-operations';
import { getSupabaseClient } from '../services/supabase';
import type { AiUsageSummary, DashboardMetrics } from '../types/contracts';
import { useLanguage } from '../i18n/LanguageContext';
import '../admin-operations.css';

const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const money = (value: number) => `$${value.toFixed(value < 1 ? 4 : 2)}`;
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function Status({ value }: { value: string }) {
  const positive = ['ACTIVE', 'APPROVED', 'HEALTHY', 'READY', 'PROCESSED', 'RESOLVED'].includes(value);
  const negative = ['FAILED', 'DEAD_LETTER', 'REMOVED', 'REJECTED'].includes(value);
  return <span className={`status-pill ${negative ? 'negative' : positive ? 'positive' : 'neutral'}`}>{value.replaceAll('_', ' ')}</span>;
}

export function ApprovedCommunityPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<ApprovedCommunityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true); setError('');
      void listApprovedCommunity(getSupabaseClient(), search)
        .then((result) => { setItems(result.items); setTotal(result.total); })
        .catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load community access.'))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  const counts = useMemo(() => ({
    active: items.filter((item) => item.state === 'ACTIVE').length,
    invites: items.filter((item) => item.state === 'INVITE_SENT').length,
    pending: items.filter((item) => ['APPROVED', 'JOIN_REQUESTED'].includes(item.state)).length,
  }), [items]);

  return <>
    <header className="page-header"><div><p className="eyebrow">{tr('Community access', 'دخول المجتمع')}</p><h1>{tr('Approved community', 'المجتمع المعتمد')}</h1><p className="muted page-subtitle">{tr('Track approvals, invitations, joins, active memberships and access errors.', 'تابع الموافقات والدعوات والانضمام والعضوية النشطة وأخطاء الوصول.')}</p></div><span className="status-pill neutral">{total} {tr('records', 'سجل')}</span></header>
    <section className="metric-grid compact-metrics"><article className="metric-card"><span>{tr('Active', 'نشط')}</span><strong>{counts.active}</strong></article><article className="metric-card"><span>{tr('Invites sent', 'دعوات مرسلة')}</span><strong>{counts.invites}</strong></article><article className="metric-card"><span>{tr('Waiting', 'بانتظار')}</span><strong>{counts.pending}</strong></article></section>
    <div className="toolbar"><label className="search-field"><span className="search-icon">⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr('Search name, username, phone…', 'ابحث بالاسم أو المستخدم أو الهاتف…')} /></label></div>
    {error && <p className="form-error">{error}</p>}
    <section className="table-card mobile-card-table"><div className="table-scroll"><table className="responsive-table"><thead><tr><th>{tr('Member', 'العضو')}</th><th>{tr('Platform', 'المنصة')}</th><th>{tr('State', 'الحالة')}</th><th>{tr('Score', 'النتيجة')}</th><th>{tr('Activated', 'التفعيل')}</th><th>{tr('Last verified', 'آخر تحقق')}</th><th /></tr></thead><tbody>
      {items.map((item) => <tr key={item.accessId}><td data-label={tr('Member', 'العضو')}><strong>{item.name || tr('Unnamed user', 'مستخدم بدون اسم')}</strong><small className="table-subtext">{item.username ? `@${item.username}` : item.phoneNumber || item.platformUserId || item.userId.slice(0, 8)}</small></td><td data-label={tr('Platform', 'المنصة')}>{item.platform ? <span className={`platform ${item.platform}`}>{item.platform}</span> : '—'}</td><td data-label={tr('State', 'الحالة')}><Status value={item.state} />{item.lastError && <small className="table-subtext error-text">{item.lastError}</small>}</td><td data-label={tr('Score', 'النتيجة')}>{item.finalScore == null ? '—' : `${Math.round(item.finalScore)}/100`}</td><td data-label={tr('Activated', 'التفعيل')}>{date(item.activatedAt)}</td><td data-label={tr('Last verified', 'آخر تحقق')}>{date(item.lastVerifiedAt)}</td><td data-label="" className="table-action"><Link className="row-link" to={`/users/${item.userId}`}>{tr('Open user', 'فتح المستخدم')} →</Link></td></tr>)}
      {!loading && !items.length && <tr><td colSpan={7} className="empty-row">{tr('No community access records found.', 'لا توجد سجلات دخول للمجتمع.')}</td></tr>}{loading && <tr><td colSpan={7} className="empty-row">{tr('Loading community…', 'جارٍ تحميل المجتمع…')}</td></tr>}
    </tbody></table></div></section>
  </>;
}

export function KnowledgeGapsPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<KnowledgeGap[]>([]);
  const [status, setStatus] = useState('OPEN');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true); setError('');
    void listKnowledgeGaps(getSupabaseClient(), status).then((r) => setItems(r.items)).catch((e) => setError(e instanceof Error ? e.message : 'Could not load knowledge gaps.')).finally(() => setLoading(false));
  }, [status, reload]);

  async function setGap(gap: KnowledgeGap, next: KnowledgeGap['status']) {
    await updateKnowledgeGapStatus(getSupabaseClient(), gap.id, next);
    setReload((n) => n + 1);
  }

  return <>
    <header className="page-header knowledge-gaps-header"><div className="knowledge-gaps-heading"><p className="eyebrow">{tr('Knowledge improvement', 'تحسين المعرفة')}</p><h1>{tr('Knowledge gaps', 'فجوات المعرفة')}</h1><p className="muted page-subtitle">{tr('Questions the assistant could not answer from verified knowledge.', 'الأسئلة التي لم يتمكن المساعد من الإجابة عنها من المعرفة الموثقة.')}</p></div><select className="compact-select knowledge-gaps-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={tr('Filter knowledge gaps by status', 'تصفية فجوات المعرفة حسب الحالة')}><option value="OPEN">{tr('Open', 'مفتوح')}</option><option value="RESOLVED">{tr('Resolved', 'تم الحل')}</option><option value="IGNORED">{tr('Ignored', 'متجاهل')}</option><option value="ALL">{tr('All', 'الكل')}</option></select></header>
    {error && <p className="form-error">{error}</p>}
    <section className="table-card mobile-card-table"><div className="table-scroll"><table className="responsive-table"><thead><tr><th>{tr('Question', 'السؤال')}</th><th>{tr('Asked', 'عدد المرات')}</th><th>{tr('Platform', 'المنصة')}</th><th>{tr('Last seen', 'آخر ظهور')}</th><th>{tr('Status', 'الحالة')}</th><th /></tr></thead><tbody>
      {items.map((gap) => <tr key={gap.id}><td data-label={tr('Question', 'السؤال')} className="question-cell"><strong>{gap.question}</strong><small className="table-subtext">{gap.language?.toUpperCase() || '—'}</small></td><td data-label={tr('Asked', 'عدد المرات')}><strong>{gap.occurrenceCount}</strong></td><td data-label={tr('Platform', 'المنصة')}>{gap.platform || '—'}</td><td data-label={tr('Last seen', 'آخر ظهور')}>{date(gap.lastSeenAt)}</td><td data-label={tr('Status', 'الحالة')}><Status value={gap.status} /></td><td data-label="" className="table-action"><div className="decision-actions">{gap.status !== 'RESOLVED' && <button className="compact-button" onClick={() => void setGap(gap, 'RESOLVED')}>{tr('Resolve', 'حل')}</button>}{gap.status !== 'IGNORED' && <button className="compact-button" onClick={() => void setGap(gap, 'IGNORED')}>{tr('Ignore', 'تجاهل')}</button>}{gap.status !== 'OPEN' && <button className="compact-button" onClick={() => void setGap(gap, 'OPEN')}>{tr('Reopen', 'إعادة فتح')}</button>}</div></td></tr>)}
      {!loading && !items.length && <tr><td colSpan={6} className="empty-row">{tr('No knowledge gaps recorded yet. Once n8n records unsupported questions they will appear here.', 'لم يتم تسجيل فجوات معرفة بعد. ستظهر هنا الأسئلة غير المدعومة عند تسجيلها من n8n.')}</td></tr>}{loading && <tr><td colSpan={6} className="empty-row">{tr('Loading gaps…', 'جارٍ تحميل الفجوات…')}</td></tr>}
    </tbody></table></div></section>
  </>;
}

export function SystemHealthPage() {
  const { tr } = useLanguage();
  const [health, setHealth] = useState<SystemHealth>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => { setError(''); void getSystemHealth(getSupabaseClient()).then(setHealth).catch((e) => setError(e instanceof Error ? e.message : 'Could not load system health.')); }, [reload]);
  if (error) return <><header className="page-header"><div><h1>{tr('System health', 'صحة النظام')}</h1></div></header><p className="form-error">{error}</p><button className="primary" onClick={() => setReload((n) => n + 1)}>{tr('Retry', 'إعادة المحاولة')}</button></>;
  if (!health) return <p className="panel">{tr('Loading system health…', 'جارٍ تحميل صحة النظام…')}</p>;
  const platformNames = ['telegram', 'whatsapp', 'discord'];
  return <>
    <header className="page-header"><div><p className="eyebrow">{tr('Operations', 'العمليات')}</p><h1>{tr('System health', 'صحة النظام')}</h1><p className="muted page-subtitle">{tr('Live database telemetry and recent platform activity. n8n health requires a dedicated heartbeat before it can be reported directly.', 'بيانات قاعدة البيانات ونشاط المنصات الحديث. يحتاج n8n إلى نبض مخصص لعرض حالته مباشرة.')}</p></div><Status value={health.databaseStatus} /></header>
    <section className="health-grid"><article className="panel health-card"><span>{tr('Failed operations', 'عمليات فاشلة')}</span><strong>{health.outboxDeadLetter}</strong><Link to="/failed-operations">{tr('Open failed jobs', 'فتح العمليات الفاشلة')} →</Link></article><article className="panel health-card"><span>{tr('Pending jobs', 'عمليات معلقة')}</span><strong>{health.outboxPending}</strong></article><article className="panel health-card"><span>{tr('Failed knowledge', 'معرفة فاشلة')}</span><strong>{health.knowledgeFailed}</strong><Link to="/knowledge">{tr('Open knowledge', 'فتح المعرفة')} →</Link></article><article className="panel health-card"><span>{tr('AI usage events', 'سجلات استخدام AI')}</span><strong>{health.aiUsageEvents}</strong><small>{date(health.aiLastRecordedAt)}</small></article></section>
    <section className="panel"><div className="section-heading"><div><p className="eyebrow">{tr('Channels', 'القنوات')}</p><h2>{tr('Recent inbound activity', 'آخر نشاط وارد')}</h2></div></div><div className="health-list">{platformNames.map((name) => { const p = health.platforms[name]; return <div key={name}><span className={`platform ${name}`}>{name}</span><span>{p ? `${p.messages24h} ${tr('messages / 24h', 'رسالة / 24 ساعة')}` : tr('No recorded inbound activity', 'لا يوجد نشاط وارد مسجل')}</span><strong>{p ? date(p.lastInboundAt) : '—'}</strong></div>; })}<div><span>n8n</span><span>{tr('Direct heartbeat not installed', 'لم يتم تثبيت نبض مباشر')}</span><strong>{health.n8nHealth.replaceAll('_', ' ')}</strong></div></div></section>
  </>;
}

export function ActivityLogPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [filter, setFilter] = useState('ALL');
  useEffect(() => { void getActivityFeed(getSupabaseClient(), 200).then(setItems); }, []);
  const visible = useMemo(() => filter === 'ALL' ? items : items.filter((item) => item.type === filter), [items, filter]);
  return <><header className="page-header"><div><p className="eyebrow">{tr('Audit & events', 'التدقيق والأحداث')}</p><h1>{tr('Activity log', 'سجل النشاط')}</h1><p className="muted page-subtitle">{tr('Recent user, knowledge, application and outbox activity in one timeline.', 'آخر نشاط للمستخدمين والمعرفة والطلبات والعمليات في خط زمني واحد.')}</p></div><select className="compact-select" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">{tr('All activity', 'كل النشاط')}</option><option value="MESSAGE_INBOUND">{tr('Messages', 'الرسائل')}</option><option value="KNOWLEDGE">{tr('Knowledge', 'المعرفة')}</option><option value="APPLICATION">{tr('Applications', 'الطلبات')}</option><option value="OUTBOX">Outbox</option></select></header><section className="panel activity-feed">{visible.map((item, i) => <article key={`${item.type}-${item.entityId}-${item.occurredAt}-${i}`}><div className="activity-marker" /><div><div className="chip-row"><span className="status-pill neutral">{item.type.replaceAll('_', ' ')}</span>{item.status && <Status value={item.status} />}{item.platform && <span className={`platform ${item.platform}`}>{item.platform}</span>}</div><strong>{item.title}</strong>{item.detail && <p className="muted">{item.detail}</p>}<time>{date(item.occurredAt)}</time></div></article>)}{!visible.length && <p className="empty-row">{tr('No activity found.', 'لا يوجد نشاط.')}</p>}</section></>;
}

export function AiPerformancePage() {
  const { tr } = useLanguage();
  const [metrics, setMetrics] = useState<DashboardMetrics>();
  const [usage, setUsage] = useState<AiUsageSummary>();
  useEffect(() => { void Promise.all([getDashboardMetrics(getSupabaseClient()), getAiUsageSummary(getSupabaseClient(), 30)]).then(([m, u]) => { setMetrics(m); setUsage(u); }); }, []);
  if (!metrics || !usage) return <p className="panel">{tr('Loading AI performance…', 'جارٍ تحميل أداء AI…')}</p>;
  const aiShare = metrics.totalMessages ? metrics.aiResponses / metrics.totalMessages : 0;
  return <><header className="page-header"><div><p className="eyebrow">{tr('Intelligence', 'الذكاء')}</p><h1>{tr('AI performance', 'أداء الذكاء الاصطناعي')}</h1><p className="muted page-subtitle">{tr('Operational view of AI usage, cache reuse and response volume.', 'عرض تشغيلي لاستخدام AI وإعادة استخدام الذاكرة المؤقتة وحجم الردود.')}</p></div></header><section className="metric-grid"><article className="metric-card"><span>{tr('AI replies', 'ردود AI')}</span><strong>{metrics.aiResponses.toLocaleString()}</strong><small>{percent(aiShare)} {tr('of processed messages', 'من الرسائل المعالجة')}</small></article><article className="metric-card"><span>{tr('Cached replies', 'ردود مخزنة')}</span><strong>{metrics.cachedResponses.toLocaleString()}</strong><small>{percent(metrics.cacheHitRate)} {tr('reuse rate', 'نسبة إعادة الاستخدام')}</small></article><article className="metric-card"><span>{tr('AI calls tracked', 'طلبات AI المسجلة')}</span><strong>{usage.totalCalls.toLocaleString()}</strong><small>{usage.totalTokens.toLocaleString()} {tr('tokens', 'رمز')}</small></article><article className="metric-card"><span>{tr('30-day cost', 'تكلفة 30 يوم')}</span><strong>{money(usage.costUsd)}</strong><small>{money(usage.avgCostPerCall)} {tr('per call', 'لكل طلب')}</small></article></section><section className="panel"><div className="section-heading"><div><p className="eyebrow">{tr('By purpose', 'حسب الغرض')}</p><h2>{tr('AI workload', 'أحمال AI')}</h2></div></div><div className="data-list">{Object.entries(usage.byPurpose).map(([purpose, item]) => <div key={purpose}><span><strong>{purpose.replaceAll('_', ' ')}</strong><small>{item.calls} {tr('calls', 'طلبات')} · {item.totalTokens.toLocaleString()} {tr('tokens', 'رمز')}</small></span><b>{money(item.costUsd)}</b></div>)}{!Object.keys(usage.byPurpose).length && <p className="muted">{tr('No AI telemetry recorded yet.', 'لم يتم تسجيل بيانات AI بعد.')}</p>}</div></section></>;
}

export function AdminUsersPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<AdminUserItem[]>([]);
  useEffect(() => { void listAdminUsers(getSupabaseClient()).then(setItems); }, []);
  return <><header className="page-header"><div><p className="eyebrow">{tr('Administration', 'الإدارة')}</p><h1>{tr('Admin users', 'المشرفون')}</h1><p className="muted page-subtitle">{tr('Accounts currently registered for administrator access.', 'الحسابات المسجلة حالياً للوصول الإداري.')}</p></div><span className="status-pill neutral">{items.length}</span></header><section className="table-card mobile-card-table"><div className="table-scroll"><table className="responsive-table"><thead><tr><th>{tr('Administrator', 'المشرف')}</th><th>{tr('Status', 'الحالة')}</th><th>{tr('Added', 'أضيف')}</th><th>{tr('User ID', 'معرف المستخدم')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.userId}><td data-label={tr('Administrator', 'المشرف')}><strong>{item.email || tr('Email unavailable', 'البريد غير متاح')}</strong>{item.isCurrentUser && <small className="table-subtext">{tr('Current account', 'الحساب الحالي')}</small>}</td><td data-label={tr('Status', 'الحالة')}><Status value={item.isActive ? 'ACTIVE' : 'DISABLED'} /></td><td data-label={tr('Added', 'أضيف')}>{date(item.createdAt)}</td><td data-label={tr('User ID', 'معرف المستخدم')} className="mono">{item.userId}</td></tr>)}</tbody></table></div></section></>;
}

export function SettingsPage() {
  const { tr } = useLanguage();
  return <><header className="page-header"><div><p className="eyebrow">{tr('Administration', 'الإدارة')}</p><h1>{tr('Settings', 'الإعدادات')}</h1><p className="muted page-subtitle">{tr('Safe configuration overview. Workflow secrets and high-risk runtime controls remain server-side.', 'نظرة آمنة على الإعدادات. تبقى الأسرار والتحكمات عالية الخطورة على الخادم.')}</p></div></header><section className="settings-grid"><article className="panel"><h2>{tr('Community', 'المجتمع')}</h2><div className="settings-list"><div><span>{tr('Access model', 'نموذج الوصول')}</span><strong>{tr('Admin approval required', 'موافقة المشرف مطلوبة')}</strong></div><div><span>{tr('Platforms', 'المنصات')}</span><strong>Telegram · WhatsApp · Discord</strong></div></div></article><article className="panel"><h2>{tr('Knowledge', 'المعرفة')}</h2><div className="settings-list"><div><span>{tr('Publishing', 'النشر')}</span><strong>{tr('Approval required before RAG', 'موافقة مطلوبة قبل RAG')}</strong></div><div><span>{tr('Editing', 'التعديل')}</span><strong>{tr('Built-in document editor', 'محرر مستندات مدمج')}</strong></div></div></article><article className="panel"><h2>{tr('AI telemetry', 'قياسات AI')}</h2><div className="settings-list"><div><span>{tr('Cost source', 'مصدر التكلفة')}</span><strong>{tr('Provider-reported OpenRouter usage', 'استخدام OpenRouter المبلغ من المزود')}</strong></div><div><span>{tr('Ledger', 'السجل')}</span><strong>ai_usage_events</strong></div></div></article><article className="panel"><h2>{tr('Security', 'الأمان')}</h2><div className="settings-list"><div><span>{tr('Admin data access', 'وصول بيانات المشرف')}</span><strong>{tr('Authenticated admin RPCs', 'RPCs للمشرف المصادق')}</strong></div><div><span>{tr('Secrets', 'الأسرار')}</span><strong>{tr('Server-side only', 'على الخادم فقط')}</strong></div></div></article></section></>;
}
