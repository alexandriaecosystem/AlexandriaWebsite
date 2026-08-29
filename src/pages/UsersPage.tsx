import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TableSkeleton } from '../components/AsyncState';
import { useToast } from '../components/Feedback';
import { getSupabaseClient } from '../services/supabase';
import { listAdminUsers, type AdminUserListItem } from '../services/users-admin';
import { useLanguage } from '../i18n/LanguageContext';
import '../users.css';

function initials(name: string | null) {
  if (!name) return 'U';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U';
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

type UserSort = 'recent' | 'messages' | 'score' | 'name';

export function UsersPage() {
  const { tr } = useLanguage();
  const { notify } = useToast();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<UserSort>('recent');
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

  const visibleItems = useMemo(() => [...items].sort((a, b) => {
    if (sort === 'messages') return b.messageCount - a.messageCount;
    if (sort === 'score') return (b.finalScore ?? -1) - (a.finalScore ?? -1);
    if (sort === 'name') return (a.name ?? '').localeCompare(b.name ?? '');
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  }), [items, sort]);

  const allVisibleSelected = Boolean(visibleItems.length && visibleItems.every((item) => selected.includes(item.id)));

  function toggleUser(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    if (allVisibleSelected) setSelected((current) => current.filter((id) => !visibleItems.some((item) => item.id === id)));
    else setSelected((current) => Array.from(new Set([...current, ...visibleItems.map((item) => item.id)])));
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

      <div className="toolbar users-toolbar">
        <label className="search-field users-search-field">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">{tr('Search users', 'بحث المستخدمين')}</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search name, username, phone or platform ID…', 'ابحث بالاسم أو اسم المستخدم أو الهاتف أو معرّف المنصة…')} />
        </label>
        <div className="table-tools users-table-tools">
          <label className="select-field">
            <span className="sr-only">{tr('Sort users', 'ترتيب المستخدمين')}</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as UserSort)}>
              <option value="recent">{tr('Most recent activity', 'الأحدث نشاطاً')}</option>
              <option value="messages">{tr('Most messages', 'الأكثر رسائل')}</option>
              <option value="score">{tr('Highest score', 'أعلى نتيجة')}</option>
              <option value="name">{tr('Name A–Z', 'الاسم أ–ي')}</option>
            </select>
          </label>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {selected.length > 0 && (
        <div className="bulk-toolbar" role="status">
          <div className="bulk-toolbar-copy"><span className="bulk-count">{selected.length}</span><span>{tr('users selected', 'مستخدمون محددون')}</span></div>
          <div className="bulk-actions"><button type="button" onClick={() => void copySelectedIds()}>{tr('Copy IDs', 'نسخ المعرّفات')}</button><button type="button" onClick={() => setSelected([])}>{tr('Clear selection', 'مسح التحديد')}</button></div>
        </div>
      )}

      {loading ? <TableSkeleton columns={8} rows={7} /> : (
        <section className="table-card mobile-card-table users-table-card">
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
                  <th aria-label={tr('Actions', 'الإجراءات')} />
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((user) => (
                  <tr key={user.id} className="user-table-row">
                    <td className="table-check-cell" data-label={tr('Select', 'تحديد')}><input className="row-select" type="checkbox" checked={selected.includes(user.id)} onChange={() => toggleUser(user.id)} aria-label={tr(`Select ${user.name || 'user'}`, `تحديد ${user.name || 'المستخدم'}`)} /></td>
                    <td data-label={tr('User', 'المستخدم')}>
                      <div className="identity-cell user-identity-cell">
                        <span className="avatar">{initials(user.name)}</span>
                        <span>
                          <strong>{user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</strong>
                          <small className="muted mono">{user.id.slice(0, 8)}…</small>
                        </span>
                      </div>
                    </td>
                    <td data-label={tr('Platforms', 'المنصات')}><div className="user-platforms">{user.platforms.map((platform) => <span key={platform} className={`platform ${platform}`}>{platform}</span>)}</div></td>
                    <td data-label={tr('Messages', 'الرسائل')}><strong>{user.messageCount.toLocaleString()}</strong></td>
                    <td data-label={tr('Score', 'النتيجة')}>{user.finalScore == null ? '—' : <span className="score-cell"><strong>{Math.round(user.finalScore)}</strong><small>/100</small></span>}</td>
                    <td data-label={tr('Status', 'الحالة')}><span className={`status-pill ${user.status === 'ACTIVE' ? 'positive' : 'neutral'}`}>{user.applicationStatus || user.status}</span></td>
                    <td data-label={tr('Last message', 'آخر رسالة')} className="muted user-last-message">{formatDate(user.lastMessageAt)}</td>
                    <td data-label="" className="table-action users-action-cell"><Link className="user-row-action" to={`/users/${user.id}`} aria-label={tr('Open conversation', 'فتح المحادثة')} title={tr('Open conversation', 'فتح المحادثة')}>↗</Link></td>
                  </tr>
                ))}
                {!visibleItems.length && <tr><td colSpan={8} className="empty-row">{tr('No users found.', 'لم يتم العثور على مستخدمين.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
