import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export function UsersPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
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
        })
        .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load users.', 'تعذر تحميل المستخدمين.')))
        .finally(() => setLoading(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search, tr]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Community', 'المجتمع')}</p>
          <h1>{tr('Users', 'المستخدمون')}</h1>
          <p className="muted page-subtitle">{tr('View every known user and open their private conversation history across connected platforms.', 'اعرض جميع المستخدمين وافتح سجل المحادثات الخاصة بهم عبر المنصات المرتبطة.')}</p>
        </div>
        <span className="status-pill neutral">{total.toLocaleString()} {tr('users', 'مستخدم')}</span>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">{tr('Search users', 'بحث المستخدمين')}</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search by name, username, phone or platform ID…', 'ابحث بالاسم أو اسم المستخدم أو الهاتف أو معرّف المنصة…')} />
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="table-card">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr('User', 'المستخدم')}</th>
                <th>{tr('Platforms', 'المنصات')}</th>
                <th>{tr('Messages', 'الرسائل')}</th>
                <th>{tr('Score', 'النتيجة')}</th>
                <th>{tr('Status', 'الحالة')}</th>
                <th>{tr('Last message', 'آخر رسالة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="identity-cell">
                      <span className="avatar">{initials(user.name)}</span>
                      <span>
                        <strong>{user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</strong>
                        <small className="muted mono">{user.id.slice(0, 8)}…</small>
                      </span>
                    </div>
                  </td>
                  <td><div className="user-platforms">{user.platforms.map((platform) => <span key={platform} className={`platform ${platform}`}>{platform}</span>)}</div></td>
                  <td><strong>{user.messageCount.toLocaleString()}</strong></td>
                  <td>{user.finalScore == null ? '—' : <span className="score-cell"><strong>{Math.round(user.finalScore)}</strong><small>/100</small></span>}</td>
                  <td><span className={`status-pill ${user.status === 'ACTIVE' ? 'positive' : 'neutral'}`}>{user.applicationStatus || user.status}</span></td>
                  <td className="muted">{formatDate(user.lastMessageAt)}</td>
                  <td className="table-action"><Link className="row-link" to={`/users/${user.id}`}>{tr('View messages', 'عرض الرسائل')} →</Link></td>
                </tr>
              ))}
              {!loading && !items.length && <tr><td colSpan={7} className="empty-row">{tr('No users found.', 'لم يتم العثور على مستخدمين.')}</td></tr>}
              {loading && <tr><td colSpan={7} className="empty-row">{tr('Loading users…', 'جارٍ تحميل المستخدمين…')}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
