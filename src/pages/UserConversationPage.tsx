import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getAdminUserConversation, type AdminUserConversation } from '../services/users-admin';
import { useLanguage } from '../i18n/LanguageContext';
import '../users.css';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function UserConversationPage() {
  const { tr } = useLanguage();
  const { userId = '' } = useParams();
  const [data, setData] = useState<AdminUserConversation | null>(null);
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    void getAdminUserConversation(getSupabaseClient(), userId)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load conversation.', 'تعذر تحميل المحادثة.')))
      .finally(() => setLoading(false));
  }, [userId, tr]);

  const visibleMessages = useMemo(() => {
    if (!data) return [];
    return platform === 'all' ? data.messages : data.messages.filter((message) => message.platform === platform);
  }, [data, platform]);

  if (loading) return <p role="status" className="panel">{tr('Loading conversation…', 'جارٍ تحميل المحادثة…')}</p>;
  if (error || !data) return <p className="form-error" role="alert">{error || tr('User not found.', 'المستخدم غير موجود.')}</p>;

  const app = data.application;
  const appStatus = app?.status ? String(app.status) : null;
  const score = app?.final_score == null ? null : Number(app.final_score);

  return (
    <>
      <Link className="back-link" to="/users">← {tr('Back to users', 'العودة إلى المستخدمين')}</Link>

      <header className="page-header detail-header user-conversation-header">
        <div>
          <p className="eyebrow">{tr('User conversation', 'محادثة المستخدم')}</p>
          <h1>{data.user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</h1>
          <p className="muted page-subtitle">{tr('Private messages exchanged with the Alexandria assistant.', 'الرسائل الخاصة المتبادلة مع مساعد Alexandria.')}</p>
          <div className="chip-row">
            <span className="status-pill neutral">{data.user.status}</span>
            <span className="status-pill neutral">{data.user.preferredLanguage.toUpperCase()}</span>
            {appStatus && <span className="status-pill positive">{appStatus}</span>}
            {score != null && Number.isFinite(score) && <span className="status-pill neutral">{tr('Score', 'النتيجة')}: {Math.round(score)}/100</span>}
          </div>
        </div>
        <div className="conversation-total"><strong>{data.messageCount.toLocaleString()}</strong><span>{tr('messages', 'رسالة')}</span></div>
      </header>

      <div className="user-profile-grid">
        <aside className="panel user-profile-panel">
          <p className="eyebrow">{tr('Profile', 'الملف الشخصي')}</p>
          <dl className="profile-list">
            <div><dt>{tr('User ID', 'معرّف المستخدم')}</dt><dd className="mono">{data.user.id}</dd></div>
            <div><dt>{tr('Country', 'الدولة')}</dt><dd>{data.user.country || '—'}</dd></div>
            <div><dt>{tr('Region', 'المنطقة')}</dt><dd>{data.user.region || '—'}</dd></div>
            <div><dt>{tr('Joined', 'تاريخ الانضمام')}</dt><dd>{formatDate(data.user.createdAt)}</dd></div>
          </dl>

          <h2>{tr('Connected accounts', 'الحسابات المرتبطة')}</h2>
          <div className="account-list">
            {data.platformAccounts.map((account) => (
              <div className="account-card" key={account.id}>
                <span className={`platform ${account.platform}`}>{account.platform}</span>
                <strong>{account.username ? `@${account.username}` : account.phoneNumber || account.platformUserId}</strong>
                <small className="muted mono">{account.platformUserId}</small>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel conversation-panel">
          <div className="conversation-toolbar">
            <div>
              <p className="eyebrow">{tr('Message history', 'سجل الرسائل')}</p>
              <h2>{tr('Conversation', 'المحادثة')}</h2>
            </div>
            <label className="conversation-filter">
              <span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span>
              <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
                <option value="all">{tr('All platforms', 'كل المنصات')}</option>
                {Array.from(new Set(data.platformAccounts.map((account) => account.platform))).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="conversation-stream">
            {visibleMessages.map((message) => (
              <article className={`message-row ${message.direction === 'ASSISTANT' ? 'assistant' : 'user'}`} key={`${message.direction}-${message.id}`}>
                <div className="message-meta">
                  <span>{message.direction === 'ASSISTANT' ? tr('Alexandria assistant', 'مساعد Alexandria') : (data.user.name || tr('User', 'المستخدم'))}</span>
                  <span className={`platform ${message.platform}`}>{message.platform}</span>
                  <time>{formatDate(message.occurredAt)}</time>
                </div>
                <div className="message-bubble">
                  <p>{message.text}</p>
                  {message.historicalExcerpt && <small className="historical-note">{tr('Historical inbound excerpt — older full user text was not stored.', 'مقتطف تاريخي للرسالة الواردة — لم يتم حفظ النص الكامل للرسائل القديمة.')}</small>}
                </div>
              </article>
            ))}
            {!visibleMessages.length && <p className="empty-row">{tr('No messages on this platform.', 'لا توجد رسائل على هذه المنصة.')}</p>}
          </div>
        </section>
      </div>
    </>
  );
}
