import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { TableSkeleton } from '../components/AsyncState';
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

function preview(text: string | null) {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'No message preview available';
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
}

export function MessagesPage() {
  const { tr } = useLanguage();
  const [items, setItems] = useState<AdminUserListItem[]>([]);
  const [search, setSearch] = useState('');
  const [platform, setPlatform] = useState('all');
  const [view, setView] = useState<'all' | 'unread'>('all');
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
      .filter((user) => view === 'all' || user.hasUnread)
      .sort((a, b) => {
        if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [items, platform, view]);

  const unreadCount = items.filter((item) => item.messageCount > 0 && item.hasUnread).length;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Inbox', 'صندوق الوارد')}</p>
          <h1>{tr('Messages', 'الرسائل')}</h1>
          <p className="muted page-subtitle">{tr('See the latest private message first, spot new conversations, and open the full user history.', 'شاهد أحدث رسالة خاصة أولاً، وتعرّف على المحادثات الجديدة، وافتح سجل المستخدم الكامل.')}</p>
        </div>
        <div className="header-status-group">
          {unreadCount > 0 && <span className="status-pill positive">{unreadCount} {tr('new', 'جديد')}</span>}
          <span className="status-pill neutral">{conversations.length.toLocaleString()} {tr('conversations', 'محادثة')}</span>
        </div>
      </header>

      <div className="toolbar messages-toolbar">
        <label className="search-field">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">{tr('Search conversations', 'بحث المحادثات')}</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search by name, username, phone or platform ID…', 'ابحث بالاسم أو اسم المستخدم أو الهاتف أو معرّف المنصة…')} />
        </label>
        <div className="table-tools">
          <label className="conversation-filter messages-platform-filter">
            <span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              <option value="all">{tr('All platforms', 'كل المنصات')}</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
            </select>
          </label>
          <label className="conversation-filter messages-platform-filter">
            <span className="sr-only">{tr('Filter read status', 'تصفية حالة القراءة')}</span>
            <select value={view} onChange={(event) => setView(event.target.value as 'all' | 'unread')}>
              <option value="all">{tr('All conversations', 'كل المحادثات')}</option>
              <option value="unread">{tr('Unread only', 'غير المقروءة فقط')}</option>
            </select>
          </label>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {loading ? <TableSkeleton columns={5} rows={7} /> : (
        <section className="table-card messages-inbox mobile-card-table">
          <div className="table-scroll">
            <table className="responsive-table">
              <thead><tr><th>{tr('Conversation', 'المحادثة')}</th><th>{tr('Latest message', 'أحدث رسالة')}</th><th>{tr('Activity', 'النشاط')}</th><th>{tr('Score', 'النتيجة')}</th><th /></tr></thead>
              <tbody>
                {conversations.map((user) => (
                  <tr key={user.id} className={user.hasUnread ? 'conversation-unread' : undefined}>
                    <td data-label={tr('Conversation', 'المحادثة')}>
                      <Link className="identity-cell identity-link" to={`/users/${user.id}?tab=conversation`}>
                        <span className="avatar">{initials(user.name)}</span>
                        <span>
                          <span className="conversation-name-line"><strong>{user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</strong>{user.hasUnread && <i className="unread-dot" title={tr('New user message', 'رسالة مستخدم جديدة')} />}</span>
                          <small className="muted">{user.latestMessagePlatform ? <span className={`platform ${user.latestMessagePlatform}`}>{user.latestMessagePlatform}</span> : user.platforms.join(', ')}</small>
                        </span>
                      </Link>
                    </td>
                    <td data-label={tr('Latest message', 'أحدث رسالة')} className="message-preview-cell">
                      <Link to={`/users/${user.id}?tab=conversation`}>
                        <small className="message-preview-sender">{user.latestMessageDirection === 'ASSISTANT' ? tr('Assistant', 'المساعد') : tr('User', 'المستخدم')}</small>
                        <span>{preview(user.latestMessageText)}</span>
                      </Link>
                    </td>
                    <td data-label={tr('Activity', 'النشاط')}><strong>{formatDate(user.lastMessageAt)}</strong><small className="table-subtext">{user.messageCount.toLocaleString()} {tr('messages', 'رسالة')}</small></td>
                    <td data-label={tr('Score', 'النتيجة')}>{user.finalScore == null ? '—' : <span className="score-cell"><strong>{Math.round(user.finalScore)}</strong><small>/100</small></span>}</td>
                    <td data-label="" className="table-action"><Link className="row-link" to={`/users/${user.id}?tab=conversation`}>{tr('Open', 'فتح')} →</Link></td>
                  </tr>
                ))}
                {!conversations.length && <tr><td colSpan={5} className="empty-row">{tr('No conversations found.', 'لم يتم العثور على محادثات.')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
