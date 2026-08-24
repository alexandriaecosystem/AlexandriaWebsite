import { useEffect, useMemo, useState } from 'react';
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

export function MessagesPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void listAdminUsers(getSupabaseClient(), search)
        .then((result) => setItems(result.items))
        .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load messages.', 'تعذر تحميل الرسائل.')))
        .finally(() => setLoading(false));
    }, 220);

    return () => window.clearTimeout(timer);
  }, [search, tr]);

  const conversations = useMemo(() => {
    return items
      .filter((user) => user.messageCount > 0)
      .filter((user) => platform === 'all' || user.platforms.includes(platform))
      .sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [items, platform]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Conversations', 'المحادثات')}</p>
          <h1>{tr('Messages', 'الرسائل')}</h1>
          <p className="muted page-subtitle">
            {tr(
              'Review private conversations and open the profile of the user who sent each message.',
              'راجع المحادثات الخاصة وافتح ملف المستخدم الذي أرسل كل رسالة.',
            )}
          </p>
        </div>
        <span className="status-pill neutral">{conversations.length.toLocaleString()} {tr('conversations', 'محادثة')}</span>
      </header>

      <div className="toolbar messages-toolbar">
        <label className="search-field">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">{tr('Search conversations', 'بحث المحادثات')}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr('Search by name, username, phone or platform ID…', 'ابحث بالاسم أو اسم المستخدم أو الهاتف أو معرّف المنصة…')}
          />
        </label>

        <label className="conversation-filter messages-platform-filter">
          <span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span>
          <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
            <option value="all">{tr('All platforms', 'كل المنصات')}</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="telegram">Telegram</option>
            <option value="discord">Discord</option>
          </select>
        </label>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="table-card messages-inbox">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{tr('Sender', 'المرسل')}</th>
                <th>{tr('Platforms', 'المنصات')}</th>
                <th>{tr('Messages', 'الرسائل')}</th>
                <th>{tr('Last activity', 'آخر نشاط')}</th>
                <th>{tr('Status', 'الحالة')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {conversations.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link className="identity-cell identity-link" to={`/users/${user.id}`}>
                      <span className="avatar">{initials(user.name)}</span>
                      <span>
                        <strong>{user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</strong>
                        <small className="muted mono">{user.id.slice(0, 8)}…</small>
                      </span>
                    </Link>
                  </td>
                  <td>
                    <div className="user-platforms">
                      {user.platforms.map((item) => <span key={item} className={`platform ${item}`}>{item}</span>)}
                    </div>
                  </td>
                  <td><strong>{user.messageCount.toLocaleString()}</strong></td>
                  <td className="muted">{formatDate(user.lastMessageAt)}</td>
                  <td><span className={`status-pill ${user.status === 'ACTIVE' ? 'positive' : 'neutral'}`}>{user.applicationStatus || user.status}</span></td>
                  <td className="table-action">
                    <Link className="row-link" to={`/users/${user.id}`}>{tr('Open conversation', 'فتح المحادثة')} →</Link>
                  </td>
                </tr>
              ))}

              {!loading && !conversations.length && (
                <tr><td colSpan={6} className="empty-row">{tr('No conversations found.', 'لم يتم العثور على محادثات.')}</td></tr>
              )}
              {loading && (
                <tr><td colSpan={6} className="empty-row">{tr('Loading conversations…', 'جارٍ تحميل المحادثات…')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
