import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TakeoverManager } from '../components/TakeoverManager';
import { listApprovedCommunity, type ApprovedCommunityItem } from '../services/admin-operations';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import '../admin-operations.css';
import './CommunitiesPage.css';

const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—';

export function CommunitiesPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<ApprovedCommunityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const accessLabel = (value: string) => ({
    GENERAL: tr('Public community only', 'المجتمع العام فقط'),
    PENDING_REVIEW: tr('Internal review pending', 'المراجعة الداخلية معلقة'),
    APPROVED: tr('Final approval — invite queued', 'موافقة نهائية — الدعوة في قائمة الإرسال'),
    INVITE_SENT: tr('Invite delivered', 'تم تسليم الدعوة'),
    JOIN_REQUESTED: tr('Join request received', 'تم استلام طلب الانضمام'),
    ACTIVE: tr('Active private member', 'عضو خاص نشط'),
    LEFT: tr('Left private community', 'غادر المجتمع الخاص'),
    REMOVED: tr('Removed', 'تمت الإزالة'),
    FAILED: tr('Invite delivery failed', 'فشل تسليم الدعوة'),
  }[value] ?? value.replaceAll('_', ' '));

  const statusTone = (value: string) => value === 'ACTIVE'
    ? 'positive'
    : ['FAILED', 'REMOVED'].includes(value)
      ? 'negative'
      : 'neutral';

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
    delivered: items.filter((item) => item.state === 'INVITE_SENT').length,
    finalApproved: items.filter((item) => item.state === 'APPROVED').length,
  }), [items]);

  return <>
    <header className="page-header communities-header">
      <div>
        <p className="eyebrow">{tr('Community operations', 'عمليات المجتمع')}</p>
        <h1>{tr('Communities', 'المجتمعات')}</h1>
        <p className="muted page-subtitle">{tr('Track final approval, protected invite delivery and actual private-community membership as separate states.', 'تتبّع الموافقة النهائية وتسليم الدعوة المحمية والعضوية الفعلية في المجتمع الخاص كحالات منفصلة.')}</p>
      </div>
    </header>

    <section className="panel community-ai-control" aria-label={tr('AI Control', 'التحكم بالذكاء الاصطناعي')}>
      <div className="section-heading">
        <div><p className="eyebrow">{tr('AI Control', 'التحكم بالذكاء الاصطناعي')}</p><h2>{tr('Human Takeover', 'التحكم البشري')}</h2><p className="muted">{tr('Pause automated replies for a community now or schedule a takeover for later.', 'أوقف الردود التلقائية لمجتمع الآن أو جدوِل تحكمًا بشريًا لاحقًا.')}</p></div>
      </div>
      <TakeoverManager />
    </section>

    <section className="metric-grid compact-metrics communities-metrics" aria-label={tr('Private access lifecycle summary', 'ملخص دورة حياة الوصول الخاص')}>
      <article className="metric-card"><span>{tr('Final approvals', 'الموافقات النهائية')}</span><strong>{counts.finalApproved}</strong></article>
      <article className="metric-card"><span>{tr('Invites delivered', 'الدعوات التي تم تسليمها')}</span><strong>{counts.delivered}</strong></article>
      <article className="metric-card"><span>{tr('Active private members', 'الأعضاء الخاصون النشطون')}</span><strong>{counts.active}</strong></article>
    </section>

    <div className="toolbar"><label className="search-field"><span className="search-icon">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search member…', 'ابحث عن عضو…')} /></label><span className="muted communities-total">{total} {tr('access records', 'سجل دخول')}</span></div>
    {error && <p className="form-error">{error}</p>}

    <section className="table-card mobile-card-table"><div className="table-scroll"><table className="responsive-table"><thead><tr><th>{tr('Member', 'العضو')}</th><th>{tr('Platform', 'المنصة')}</th><th>{tr('Access lifecycle', 'دورة حياة الوصول')}</th><th>{tr('Assessment score', 'نتيجة التقييم')}</th><th>{tr('Actual membership', 'العضوية الفعلية')}</th><th>{tr('Last verified', 'آخر تحقق')}</th><th /></tr></thead><tbody>
      {items.map((item) => <tr key={item.accessId}>
        <td data-label={tr('Member', 'العضو')}><strong>{item.name || tr('Unnamed member', 'عضو بدون اسم')}</strong><small className="table-subtext">{item.username ? `@${item.username}` : item.phoneNumber || tr('Community member', 'عضو في المجتمع')}</small></td>
        <td data-label={tr('Platform', 'المنصة')}>{item.platform ? <span className={`platform ${item.platform}`}>{item.platform}</span> : '—'}</td>
        <td data-label={tr('Access lifecycle', 'دورة حياة الوصول')}><span className={`status-pill ${statusTone(item.state)}`}>{accessLabel(item.state)}</span>{item.lastError && <small className="table-subtext error-text">{tr('Access delivery needs attention', 'تسليم الوصول يحتاج إلى متابعة')}</small>}</td>
        <td data-label={tr('Assessment score', 'نتيجة التقييم')}>{item.finalScore == null ? '—' : `${Math.round(item.finalScore)}/100`}</td>
        <td data-label={tr('Actual membership', 'العضوية الفعلية')}>{item.state === 'ACTIVE' ? date(item.activatedAt) : tr('Not active', 'غير نشطة')}</td>
        <td data-label={tr('Last verified', 'آخر تحقق')}>{date(item.lastVerifiedAt)}</td>
        <td data-label="" className="table-action"><Link className="row-link" to={`/users/${item.userId}`}>{tr('Open member', 'فتح العضو')} →</Link></td>
      </tr>)}
      {!loading && !items.length && <tr><td colSpan={7} className="empty-row">{tr('No community access records found.', 'لا توجد سجلات دخول للمجتمع.')}</td></tr>}
      {loading && <tr><td colSpan={7} className="empty-row">{tr('Loading communities…', 'جارٍ تحميل المجتمعات…')}</td></tr>}
    </tbody></table></div></section>
  </>;
}
