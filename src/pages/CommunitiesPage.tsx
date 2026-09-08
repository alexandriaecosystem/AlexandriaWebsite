import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TakeoverManager } from '../components/TakeoverManager';
import { listApprovedCommunity, type ApprovedCommunityItem } from '../services/admin-operations';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import '../admin-operations.css';
import './CommunitiesPage.css';

const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

function Status({ value }: { value: string }) {
  const positive = ['ACTIVE', 'APPROVED', 'READY'].includes(value);
  const negative = ['FAILED', 'REMOVED', 'REJECTED'].includes(value);
  return <span className={`status-pill ${negative ? 'negative' : positive ? 'positive' : 'neutral'}`}>{value.replaceAll('_', ' ')}</span>;
}

export function CommunitiesPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<ApprovedCommunityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');


  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void listApprovedCommunity(getSupabaseClient(), search)
        .then((result) => { setItems(result.items); setTotal(result.total); })
        .catch(() => setError(tr('Could not load community access.', 'تعذر تحميل دخول المجتمع.')))
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search, tr]);

  const counts = useMemo(() => ({
    active: items.filter((item) => item.state === 'ACTIVE').length,
    invites: items.filter((item) => item.state === 'INVITE_SENT').length,
    pending: items.filter((item) => ['APPROVED', 'JOIN_REQUESTED'].includes(item.state)).length,
  }), [items]);

  return <>
    <header className="page-header communities-header">
      <div>
        <p className="eyebrow">{tr('Community operations', 'عمليات المجتمع')}</p>
        <h1>{tr('Communities', 'المجتمعات')}</h1>
        <p className="muted page-subtitle">{tr('Manage community access and take over AI replies when a human should respond.', 'أدر دخول المجتمع وتولَّ الردود بدل الذكاء الاصطناعي عند الحاجة.')}</p>
      </div>

    </header>

    <section className="panel community-ai-control" aria-label={tr('AI Control', 'التحكم بالذكاء الاصطناعي')}>
      <div className="section-heading">
        <div><p className="eyebrow">{tr('AI Control', 'التحكم بالذكاء الاصطناعي')}</p><h2>{tr('Human Takeover', 'التحكم البشري')}</h2><p className="muted">{tr('Pause automated replies for a community now or schedule a takeover for later.', 'أوقف الردود التلقائية لمجتمع الآن أو جدوِل تحكمًا بشريًا لاحقًا.')}</p></div>
      </div>
      <TakeoverManager />
    </section>

    <section className="metric-grid compact-metrics communities-metrics" aria-label={tr('Community access summary', 'ملخص دخول المجتمع')}>
      <article className="metric-card"><span>{tr('Active members', 'أعضاء نشطون')}</span><strong>{counts.active}</strong></article>
      <article className="metric-card"><span>{tr('Invites sent', 'دعوات مرسلة')}</span><strong>{counts.invites}</strong></article>
      <article className="metric-card"><span>{tr('Waiting', 'بانتظار')}</span><strong>{counts.pending}</strong></article>
    </section>

    <div className="toolbar"><label className="search-field"><span className="search-icon">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search member…', 'ابحث عن عضو…')} /></label><span className="muted communities-total">{total} {tr('access records', 'سجل دخول')}</span></div>
    {error && <p className="form-error">{error}</p>}

    <section className="table-card mobile-card-table"><div className="table-scroll"><table className="responsive-table"><thead><tr><th>{tr('Member', 'العضو')}</th><th>{tr('Platform', 'المنصة')}</th><th>{tr('State', 'الحالة')}</th><th>{tr('Score', 'النتيجة')}</th><th>{tr('Activated', 'التفعيل')}</th><th>{tr('Last verified', 'آخر تحقق')}</th><th /></tr></thead><tbody>
      {items.map((item) => <tr key={item.accessId}>
        <td data-label={tr('Member', 'العضو')}><strong>{item.name || tr('Unnamed member', 'عضو بدون اسم')}</strong><small className="table-subtext">{item.username ? `@${item.username}` : item.phoneNumber || tr('Community member', 'عضو في المجتمع')}</small></td>
        <td data-label={tr('Platform', 'المنصة')}>{item.platform ? <span className={`platform ${item.platform}`}>{item.platform}</span> : '—'}</td>
        <td data-label={tr('State', 'الحالة')}><Status value={item.state} />{item.lastError && <small className="table-subtext error-text">{tr('Access needs attention', 'الدخول يحتاج إلى متابعة')}</small>}</td>
        <td data-label={tr('Score', 'النتيجة')}>{item.finalScore == null ? '—' : `${Math.round(item.finalScore)}/100`}</td>
        <td data-label={tr('Activated', 'التفعيل')}>{date(item.activatedAt)}</td>
        <td data-label={tr('Last verified', 'آخر تحقق')}>{date(item.lastVerifiedAt)}</td>
        <td data-label="" className="table-action"><Link className="row-link" to={`/users/${item.userId}`}>{tr('Open member', 'فتح العضو')} →</Link></td>
      </tr>)}
      {!loading && !items.length && <tr><td colSpan={7} className="empty-row">{tr('No community access records found.', 'لا توجد سجلات دخول للمجتمع.')}</td></tr>}
      {loading && <tr><td colSpan={7} className="empty-row">{tr('Loading communities…', 'جارٍ تحميل المجتمعات…')}</td></tr>}
    </tbody></table></div></section>
  </>;
}
