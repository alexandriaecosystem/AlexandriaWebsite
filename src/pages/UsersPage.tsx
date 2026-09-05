import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TableSkeleton } from '../components/AsyncState';
import { useToast } from '../components/Feedback';
import { getSupabaseClient } from '../services/supabase';
import { listAdminUsers, type AdminUserListItem } from '../services/users-admin';
import { useLanguage } from '../i18n/LanguageContext';
import '../users.css';
import '../users-visual-dashboard.css';

function initials(name: string | null) {
  if (!name) return 'U';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatRelativeDate(value: string | null, tr: (en: string, ar: string) => string) {
  if (!value) return tr('No activity yet', 'لا يوجد نشاط بعد');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return tr('Unknown time', 'وقت غير معروف');
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);
  if (absolute < 60) return tr('Just now', 'الآن');
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
  if (absolute < 86400 * 30) return formatter.format(Math.round(seconds / 86400), 'day');
  return formatter.format(Math.round(seconds / (86400 * 30)), 'month');
}

function effectiveStatus(user: AdminUserListItem) {
  return (user.applicationStatus || user.status || 'OTHER').toUpperCase();
}

function humanizeStatus(value: string, tr: (en: string, ar: string) => string) {
  if (value === 'ACTIVE') return tr('Active', 'نشط');
  if (value === 'PENDING_REVIEW') return tr('Pending review', 'بانتظار المراجعة');
  if (value === 'CANCELLED') return tr('Cancelled', 'ملغى');
  if (value === 'BLOCKED') return tr('Blocked', 'محظور');
  return value.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function statusTone(value: string) {
  if (['ACTIVE', 'APPROVED'].includes(value)) return 'positive';
  if (['CANCELLED', 'BLOCKED', 'REJECTED', 'REMOVED'].includes(value)) return 'negative';
  if (value === 'PENDING_REVIEW') return 'pending-review';
  return 'neutral';
}

function platformLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === 'whatsapp') return 'WhatsApp';
  if (normalized === 'telegram') return 'Telegram';
  if (normalized === 'discord') return 'Discord';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

type UserSort = 'recent' | 'messages' | 'score' | 'name';

export function UsersPage() {
  const { tr } = useLanguage();
  const { notify } = useToast();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<UserSort>('recent');
  const [platformFilter, setPlatformFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void listAdminUsers(getSupabaseClient(), search)
        .then((result) => {
          setItems(result.items);
          setTotal(result.total);
          setSelected((current) => current.filter((id) => result.items.some((item) => item.id === id)));
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load users.', 'تعذر تحميل المستخدمين.')))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, tr]);

  const platformRows = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((user) => user.platforms.forEach((platform) => {
      const key = platform.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const statusRows = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((user) => {
      const status = effectiveStatus(user);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });
    return counts;
  }, [items]);

  const activeCount = statusRows.get('ACTIVE') ?? 0;
  const pendingCount = statusRows.get('PENDING_REVIEW') ?? 0;
  const cancelledCount = statusRows.get('CANCELLED') ?? 0;
  const otherCount = Math.max(0, items.length - activeCount - pendingCount - cancelledCount);
  const loadedCount = items.length;
  const activePercent = loadedCount ? Math.round((activeCount / loadedCount) * 100) : 0;
  const pendingPercent = loadedCount ? Math.round((pendingCount / loadedCount) * 100) : 0;
  const cancelledPercent = loadedCount ? Math.round((cancelledCount / loadedCount) * 100) : 0;
  const activeEnd = activePercent;
  const pendingEnd = activeEnd + pendingPercent;
  const cancelledEnd = pendingEnd + cancelledPercent;
  const statusDonut = loadedCount
    ? `conic-gradient(var(--success) 0 ${activeEnd}%, var(--warning) ${activeEnd}% ${pendingEnd}%, var(--danger) ${pendingEnd}% ${cancelledEnd}%, #748091 ${cancelledEnd}% 100%)`
    : 'var(--border)';

  const availablePlatforms = useMemo(() => platformRows.map(([platform]) => platform), [platformRows]);
  const availableStatuses = useMemo(() => Array.from(statusRows.keys()).sort(), [statusRows]);

  const visibleItems = useMemo(() => items
    .filter((user) => platformFilter === 'ALL' || user.platforms.some((platform) => platform.toLowerCase() === platformFilter))
    .filter((user) => statusFilter === 'ALL' || effectiveStatus(user) === statusFilter)
    .sort((a, b) => {
      if (sort === 'messages') return b.messageCount - a.messageCount;
      if (sort === 'score') return (b.finalScore ?? -1) - (a.finalScore ?? -1);
      if (sort === 'name') return (a.name ?? '').localeCompare(b.name ?? '');
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    }), [items, platformFilter, sort, statusFilter]);

  const allVisibleSelected = Boolean(visibleItems.length && visibleItems.every((item) => selected.includes(item.id)));
  const hasLocalFilters = platformFilter !== 'ALL' || statusFilter !== 'ALL' || sort !== 'recent' || Boolean(search);
  const breakdownScope = loadedCount === total
    ? tr('of total', 'من الإجمالي')
    : tr('of loaded users', 'من المستخدمين المحمّلين');

  function toggleUser(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    if (allVisibleSelected) setSelected((current) => current.filter((id) => !visibleItems.some((item) => item.id === id)));
    else setSelected((current) => Array.from(new Set([...current, ...visibleItems.map((item) => item.id)])));
  }

  function resetFilters() {
    setSearch('');
    setPlatformFilter('ALL');
    setStatusFilter('ALL');
    setSort('recent');
  }

  async function copySelectedIds() {
    try {
      await navigator.clipboard.writeText(selected.join('\n'));
      notify({ tone: 'success', title: tr('User IDs copied', 'تم نسخ معرّفات المستخدمين'), message: tr(`${selected.length} selected IDs copied to the clipboard.`, `تم نسخ ${selected.length} معرّفاً محدداً إلى الحافظة.`) });
    } catch {
      notify({ tone: 'error', title: tr('Could not copy IDs', 'تعذر نسخ المعرّفات'), message: tr('Your browser blocked clipboard access.', 'منع المتصفح الوصول إلى الحافظة.') });
    }
  }

  return (
    <>
      <header className="page-header users-page-header">
        <div>
          <p className="eyebrow">{tr('Community', 'المجتمع')}</p>
          <h1>{tr('Users', 'المستخدمون')}</h1>
          <p className="muted page-subtitle">{tr('Manage members and review activity across every connected community platform.', 'أدر الأعضاء وراجع النشاط عبر جميع منصات المجتمع المرتبطة.')}</p>
        </div>
        <span className="status-pill neutral users-total-pill">{total.toLocaleString()} {tr('users', 'مستخدم')}</span>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? <TableSkeleton columns={8} rows={7} /> : (
        <>
          <section className="users-summary-grid" aria-label={tr('User summary', 'ملخص المستخدمين')}>
            <article className="users-summary-card total">
              <span className="users-summary-icon" aria-hidden="true">◎</span>
              <div><small>{tr('Total users', 'إجمالي المستخدمين')}</small><strong>{total.toLocaleString()}</strong><span>{loadedCount === total ? tr('Community records', 'سجلات المجتمع') : tr(`${loadedCount.toLocaleString()} loaded`, `${loadedCount.toLocaleString()} محمّل`)}</span></div>
            </article>
            <article className="users-summary-card active">
              <span className="users-summary-icon" aria-hidden="true">●</span>
              <div><small>{tr('Active', 'نشط')}</small><strong>{activeCount.toLocaleString()}</strong><span>{activePercent}% {breakdownScope}</span></div>
            </article>
            <article className="users-summary-card pending">
              <span className="users-summary-icon" aria-hidden="true">◷</span>
              <div><small>{tr('Pending review', 'بانتظار المراجعة')}</small><strong>{pendingCount.toLocaleString()}</strong><span>{pendingPercent}% {breakdownScope}</span></div>
            </article>
            <article className="users-summary-card cancelled">
              <span className="users-summary-icon" aria-hidden="true">×</span>
              <div><small>{tr('Cancelled', 'ملغى')}</small><strong>{cancelledCount.toLocaleString()}</strong><span>{cancelledPercent}% {breakdownScope}</span></div>
            </article>
          </section>

          <section className="users-insight-grid">
            <article className="panel users-platform-panel">
              <div className="section-heading">
                <div><p className="eyebrow">{tr('Distribution', 'التوزيع')}</p><h2>{tr('Users by platform', 'المستخدمون حسب المنصة')}</h2></div>
                <small className="muted">{tr('A user can appear on more than one platform.', 'قد يظهر المستخدم على أكثر من منصة.')}</small>
              </div>
              {platformRows.length ? <div className="users-platform-bars">{platformRows.map(([platform, count]) => {
                const percent = loadedCount ? Math.round((count / loadedCount) * 100) : 0;
                return <div className={`users-platform-row ${platform}`} key={platform}>
                  <div><span className={`platform ${platform}`}>{platformLabel(platform)}</span><strong>{count.toLocaleString()}</strong></div>
                  <div className="users-platform-track" aria-hidden="true"><i style={{ width: `${percent}%` }} /></div>
                  <small>{percent}% {breakdownScope}</small>
                </div>;
              })}</div> : <p className="muted users-insight-empty">{tr('No connected platform data for these users.', 'لا توجد بيانات منصات مرتبطة لهؤلاء المستخدمين.')}</p>}
            </article>

            <article className="panel users-status-panel">
              <div className="section-heading"><div><p className="eyebrow">{tr('Membership', 'العضوية')}</p><h2>{tr('User status', 'حالة المستخدم')}</h2></div></div>
              <div className="users-status-visual">
                <div
                  className="users-status-donut"
                  role="img"
                  aria-label={tr(`User status: ${activeCount} active, ${pendingCount} pending review, ${cancelledCount} cancelled, ${otherCount} other`, `حالة المستخدم: ${activeCount} نشط، ${pendingCount} بانتظار المراجعة، ${cancelledCount} ملغى، ${otherCount} أخرى`)}
                  style={{ background: statusDonut }}
                >
                  <span><strong>{loadedCount.toLocaleString()}</strong><small>{tr('Users', 'مستخدمون')}</small></span>
                </div>
                <div className="users-status-legend" aria-hidden="true">
                  <span className="active"><i />{tr('Active users', 'مستخدمون نشطون')}<b>{activeCount}</b></span>
                  <span className="pending"><i />{tr('Review queue', 'قائمة المراجعة')}<b>{pendingCount}</b></span>
                  <span className="cancelled"><i />{tr('Cancelled users', 'مستخدمون ملغون')}<b>{cancelledCount}</b></span>
                  <span className="other"><i />{tr('Other users', 'مستخدمون آخرون')}<b>{otherCount}</b></span>
                </div>
              </div>
            </article>
          </section>

          <div className="toolbar users-toolbar">
            <div className="users-filter-toolbar">
              <label className="search-field users-search-field">
                <span className="search-icon" aria-hidden="true">⌕</span>
                <span className="sr-only">{tr('Search users', 'بحث المستخدمين')}</span>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search name, username, phone or platform ID…', 'ابحث بالاسم أو اسم المستخدم أو الهاتف أو معرّف المنصة…')} />
              </label>
              <div className="table-tools users-table-tools">
                <label className="select-field users-filter-select">
                  <span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span>
                  <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}>
                    <option value="ALL">{tr('All platforms', 'كل المنصات')}</option>
                    {availablePlatforms.map((platform) => <option value={platform} key={platform}>{platformLabel(platform)}</option>)}
                  </select>
                </label>
                <label className="select-field users-filter-select">
                  <span className="sr-only">{tr('Filter by status', 'تصفية حسب الحالة')}</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="ALL">{tr('All statuses', 'كل الحالات')}</option>
                    {availableStatuses.map((status) => <option value={status} key={status}>{humanizeStatus(status, tr)}</option>)}
                  </select>
                </label>
                <label className="select-field users-sort-select">
                  <span className="sr-only">{tr('Sort users', 'ترتيب المستخدمين')}</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value as UserSort)}>
                    <option value="recent">{tr('Most recent activity', 'الأحدث نشاطاً')}</option>
                    <option value="messages">{tr('Most messages', 'الأكثر رسائل')}</option>
                    <option value="score">{tr('Highest score', 'أعلى نتيجة')}</option>
                    <option value="name">{tr('Name A–Z', 'الاسم أ–ي')}</option>
                  </select>
                </label>
                {hasLocalFilters && <button className="users-reset-button" type="button" onClick={resetFilters}>{tr('Reset', 'إعادة ضبط')}</button>}
              </div>
            </div>
          </div>

          {selected.length > 0 && (
            <div className="bulk-toolbar" role="status">
              <div className="bulk-toolbar-copy"><span className="bulk-count">{selected.length}</span><span>{tr('users selected', 'مستخدمون محددون')}</span></div>
              <div className="bulk-actions"><button type="button" onClick={() => void copySelectedIds()}>{tr('Copy IDs', 'نسخ المعرّفات')}</button><button type="button" onClick={() => setSelected([])}>{tr('Clear selection', 'مسح التحديد')}</button></div>
            </div>
          )}

          <section className="table-card mobile-card-table users-table-card">
            <div className="users-table-meta">
              <span>{tr(`Showing ${visibleItems.length.toLocaleString()} of ${total.toLocaleString()} users`, `عرض ${visibleItems.length.toLocaleString()} من ${total.toLocaleString()} مستخدم`)}</span>
              {(platformFilter !== 'ALL' || statusFilter !== 'ALL') && <small>{tr('Local filters applied', 'تم تطبيق عوامل تصفية محلية')}</small>}
            </div>
            <div className="table-scroll">
              <table className="responsive-table users-table">
                <thead>
                  <tr>
                    <th className="table-check-cell"><input className="row-select" type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label={tr('Select all visible users', 'تحديد جميع المستخدمين الظاهرين')} /></th>
                    <th>{tr('User', 'المستخدم')}</th>
                    <th>{tr('Platforms', 'المنصات')}</th>
                    <th>{tr('Messages', 'الرسائل')}</th>
                    <th>{tr('Score', 'النتيجة')}</th>
                    <th>{tr('Status', 'الحالة')}</th>
                    <th>{tr('Last message', 'آخر رسالة')}</th>
                    <th>{tr('Actions', 'الإجراءات')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((user) => {
                    const userStatus = effectiveStatus(user);
                    const score = user.finalScore == null ? null : Math.max(0, Math.min(100, Math.round(user.finalScore)));
                    return (
                      <tr key={user.id} className="user-table-row">
                        <td className="table-check-cell" data-label={tr('Select', 'تحديد')}><input className="row-select" type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleUser(user.id)} aria-label={tr(`Select ${user.name || 'user'}`, `تحديد ${user.name || 'المستخدم'}`)} /></td>
                        <td data-label={tr('User', 'المستخدم')}>
                          <Link className="identity-cell user-identity-cell identity-link" to={`/users/${user.id}`}>
                            <span className="avatar">{initials(user.name)}</span>
                            <span>
                              <strong>{user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</strong>
                              <small className="muted mono">{user.id.slice(0, 8)}…</small>
                            </span>
                          </Link>
                        </td>
                        <td data-label={tr('Platforms', 'المنصات')}><div className="user-platforms">{user.platforms.map((platform) => <span key={platform} className={`platform ${platform.toLowerCase()}`}>{platformLabel(platform)}</span>)}</div></td>
                        <td data-label={tr('Messages', 'الرسائل')}><strong className="users-message-count">{user.messageCount.toLocaleString()}</strong></td>
                        <td data-label={tr('Score', 'النتيجة')}>{score == null ? <span className="muted">—</span> : <span className="score-cell user-score-cell"><span><strong>{score}</strong><small>/100</small></span><i className="user-score-track" aria-hidden="true"><b style={{ width: `${score}%` }} /></i></span>}</td>
                        <td data-label={tr('Status', 'الحالة')}><span className={`status-pill user-status-pill ${statusTone(userStatus)}`}>{humanizeStatus(userStatus, tr)}</span></td>
                        <td data-label={tr('Last message', 'آخر رسالة')} className="user-last-message"><span className="users-last-message-stack"><span>{formatDate(user.lastMessageAt)}</span><small>{formatRelativeDate(user.lastMessageAt, tr)}</small></span></td>
                        <td data-label={tr('Actions', 'الإجراءات')} className="table-action users-action-cell"><Link className="user-row-action" to={`/users/${user.id}`} aria-label={tr('Open conversation', 'فتح المحادثة')} title={tr('Open conversation', 'فتح المحادثة')}><span aria-hidden="true">↗</span><b>{tr('Open', 'فتح')}</b></Link></td>
                      </tr>
                    );
                  })}
                  {!visibleItems.length && <tr><td colSpan={8} className="empty-row">{tr('No users match these filters.', 'لا يوجد مستخدمون يطابقون عوامل التصفية.')}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
