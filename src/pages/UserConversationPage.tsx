import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { getAdminUserConversation, markAdminConversationRead, type AdminUserConversation } from '../services/users-admin';
import { useLanguage } from '../i18n/LanguageContext';
import '../users.css';

type UserTab = 'overview' | 'conversation' | 'evaluation' | 'access';

function formatDate(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function readableState(value: unknown) {
  return String(value ?? 'GENERAL').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export function UserConversationPage() {
  const { tr } = useLanguage();
  const { userId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: UserTab = requestedTab === 'conversation' || requestedTab === 'evaluation' || requestedTab === 'access' ? requestedTab : 'overview';
  const [data, setData] = useState<AdminUserConversation | null>(null);
  const [platform, setPlatform] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const client = getSupabaseClient();
    void getAdminUserConversation(client, userId)
      .then((value) => {
        setData(value);
        void markAdminConversationRead(client, userId).catch(() => undefined);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : tr('Could not load user.', 'تعذر تحميل المستخدم.')))
      .finally(() => setLoading(false));
  }, [userId, tr]);

  const visibleMessages = useMemo(() => {
    if (!data) return [];
    return platform === 'all' ? data.messages : data.messages.filter((message) => message.platform === platform);
  }, [data, platform]);

  if (loading) return <p role="status" className="panel">{tr('Loading user…', 'جارٍ تحميل المستخدم…')}</p>;
  if (error || !data) return <p className="form-error" role="alert">{error || tr('User not found.', 'المستخدم غير موجود.')}</p>;

  const app = data.application;
  const access = data.access;
  const appStatus = app?.status ? String(app.status) : null;
  const score = app?.final_score == null ? null : Number(app.final_score);
  const strengths = stringArray(app?.strengths);
  const concerns = stringArray(app?.concerns);
  const evidence = stringArray(app?.evidence);

  function selectTab(next: UserTab) {
    setSearchParams(next === 'overview' ? {} : { tab: next }, { replace: true });
  }

  const tabs: Array<{ id: UserTab; en: string; ar: string }> = [
    { id: 'overview', en: 'Overview', ar: 'نظرة عامة' },
    { id: 'conversation', en: 'Conversation', ar: 'المحادثة' },
    { id: 'evaluation', en: 'Evaluation', ar: 'التقييم' },
    { id: 'access', en: 'Community access', ar: 'الوصول للمجتمع' },
  ];

  return (
    <>
      <Link className="back-link" to="/users">← {tr('Back to users', 'العودة إلى المستخدمين')}</Link>
      <header className="page-header detail-header user-conversation-header">
        <div>
          <p className="eyebrow">{tr('User', 'المستخدم')}</p>
          <h1>{data.user.name || tr('Unnamed user', 'مستخدم بدون اسم')}</h1>
          <p className="muted page-subtitle">{tr('Profile, conversation, evaluation and community access in one place.', 'الملف الشخصي والمحادثة والتقييم والوصول إلى المجتمع في مكان واحد.')}</p>
          <div className="chip-row">
            <span className="status-pill neutral">{data.user.status}</span>
            <span className="status-pill neutral">{data.user.preferredLanguage.toUpperCase()}</span>
            {appStatus && <span className="status-pill positive">{readableState(appStatus)}</span>}
            {score != null && Number.isFinite(score) && <span className="status-pill neutral">{tr('Score', 'النتيجة')}: {Math.round(score)}/100</span>}
          </div>
        </div>
        <div className="conversation-total"><strong>{data.messageCount.toLocaleString()}</strong><span>{tr('messages', 'رسالة')}</span></div>
      </header>

      <nav className="user-detail-tabs" aria-label={tr('User details', 'تفاصيل المستخدم')}>
        {tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => selectTab(item.id)}>{tr(item.en, item.ar)}</button>)}
      </nav>

      {tab === 'overview' && (
        <div className="user-overview-grid">
          <section className="panel user-profile-panel">
            <p className="eyebrow">{tr('Profile', 'الملف الشخصي')}</p>
            <dl className="profile-list">
              <div><dt>{tr('User ID', 'معرّف المستخدم')}</dt><dd className="mono">{data.user.id}</dd></div>
              <div><dt>{tr('Country', 'الدولة')}</dt><dd>{data.user.country || '—'}</dd></div>
              <div><dt>{tr('Region', 'المنطقة')}</dt><dd>{data.user.region || '—'}</dd></div>
              <div><dt>{tr('Joined', 'تاريخ الانضمام')}</dt><dd>{formatDate(data.user.createdAt)}</dd></div>
              <div><dt>{tr('Latest assessment', 'أحدث تقييم')}</dt><dd>{score == null ? '—' : `${Math.round(score)}/100`}</dd></div>
              <div><dt>{tr('Application', 'الطلب')}</dt><dd>{appStatus ? readableState(appStatus) : '—'}</dd></div>
            </dl>
          </section>
          <section className="panel user-profile-panel">
            <p className="eyebrow">{tr('Connected accounts', 'الحسابات المرتبطة')}</p>
            <div className="account-list">
              {data.platformAccounts.map((account) => (
                <div className="account-card" key={account.id}>
                  <span className={`platform ${account.platform}`}>{account.platform}</span>
                  <strong>{account.username ? `@${account.username}` : account.phoneNumber || account.platformUserId}</strong>
                  <small className="muted mono">{account.platformUserId}</small>
                </div>
              ))}
              {!data.platformAccounts.length && <p className="muted">{tr('No connected platform accounts.', 'لا توجد حسابات منصات مرتبطة.')}</p>}
            </div>
          </section>
        </div>
      )}

      {tab === 'conversation' && (
        <section className="panel conversation-panel user-tab-panel">
          <div className="conversation-toolbar">
            <div><p className="eyebrow">{tr('Message history', 'سجل الرسائل')}</p><h2>{tr('Conversation', 'المحادثة')}</h2></div>
            <label className="conversation-filter"><span className="sr-only">{tr('Filter by platform', 'تصفية حسب المنصة')}</span><select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="all">{tr('All platforms', 'كل المنصات')}</option>{Array.from(new Set(data.platformAccounts.map((account) => account.platform))).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          </div>
          <div className="conversation-stream">
            {visibleMessages.map((message) => (
              <article className={`message-row ${message.direction === 'ASSISTANT' ? 'assistant' : 'user'}`} key={`${message.direction}-${message.id}`}>
                <div className="message-meta"><span>{message.direction === 'ASSISTANT' ? tr('Alexandria assistant', 'مساعد Alexandria') : (data.user.name || tr('User', 'المستخدم'))}</span><span className={`platform ${message.platform}`}>{message.platform}</span><time>{formatDate(message.occurredAt)}</time></div>
                <div className="message-bubble"><p>{message.text}</p>{message.historicalExcerpt && <small className="historical-note">{tr('Historical inbound excerpt — older full user text was not stored.', 'مقتطف تاريخي للرسالة الواردة — لم يتم حفظ النص الكامل للرسائل القديمة.')}</small>}</div>
              </article>
            ))}
            {!visibleMessages.length && <p className="empty-row">{tr('No messages on this platform.', 'لا توجد رسائل على هذه المنصة.')}</p>}
          </div>
        </section>
      )}

      {tab === 'evaluation' && (
        <div className="user-overview-grid">
          <section className="panel">
            <p className="eyebrow">{tr('Evaluation', 'التقييم')}</p><h2>{tr('Assessment summary', 'ملخص التقييم')}</h2>
            <p>{String(app?.evaluation_summary ?? tr('No evaluation summary is available yet.', 'لا يتوفر ملخص تقييم حتى الآن.'))}</p>
            <div className="profile-list compact-profile-list">
              <div><dt>{tr('Advisory score', 'النتيجة الاستشارية')}</dt><dd>{score == null ? '—' : `${Math.round(score)}/100`}</dd></div>
              <div><dt>{tr('Recommendation', 'التوصية')}</dt><dd>{app?.recommendation ? readableState(app.recommendation) : '—'}</dd></div>
              <div><dt>{tr('Reviewed', 'تمت المراجعة')}</dt><dd>{formatDate(app?.reviewed_at)}</dd></div>
            </div>
          </section>
          <section className="panel signal-panel positive-panel"><p className="eyebrow">{tr('Signals', 'المؤشرات')}</p><h2>{tr('Strengths', 'نقاط القوة')}</h2>{strengths.length ? <ul className="signal-list">{strengths.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No strengths recorded yet.', 'لم يتم تسجيل نقاط قوة بعد.')}</p>}</section>
          <section className="panel signal-panel concern-panel"><p className="eyebrow">{tr('Signals', 'المؤشرات')}</p><h2>{tr('Concerns', 'الملاحظات')}</h2>{concerns.length ? <ul className="signal-list">{concerns.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No concerns recorded yet.', 'لم يتم تسجيل ملاحظات بعد.')}</p>}</section>
          <section className="panel"><p className="eyebrow">{tr('Evidence', 'الأدلة')}</p><h2>{tr('Supporting evidence', 'الأدلة الداعمة')}</h2>{evidence.length ? <ul className="signal-list">{evidence.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{tr('No evidence excerpts are available yet.', 'لا تتوفر مقتطفات أدلة بعد.')}</p>}</section>
        </div>
      )}

      {tab === 'access' && (
        <section className="panel user-tab-panel">
          <p className="eyebrow">{tr('Community access', 'الوصول إلى المجتمع')}</p><h2>{tr('Current access status', 'حالة الوصول الحالية')}</h2>
          <div className="access-status-hero"><span className="status-pill neutral">{readableState(access?.state)}</span><p className="muted">{tr('This is the latest server-recorded state for the private approved community.', 'هذه أحدث حالة مسجلة على الخادم للمجتمع الخاص المعتمد.')}</p></div>
          <dl className="profile-list access-detail-list">
            <div><dt>{tr('Invite sent', 'تم إرسال الدعوة')}</dt><dd>{formatDate(access?.invite_sent_at)}</dd></div>
            <div><dt>{tr('Join requested', 'تم طلب الانضمام')}</dt><dd>{formatDate(access?.join_requested_at)}</dd></div>
            <div><dt>{tr('Activated', 'تم التفعيل')}</dt><dd>{formatDate(access?.activated_at)}</dd></div>
            <div><dt>{tr('Last verified', 'آخر تحقق')}</dt><dd>{formatDate(access?.last_verified_at)}</dd></div>
            <div><dt>{tr('Removed', 'تمت الإزالة')}</dt><dd>{formatDate(access?.removed_at)}</dd></div>
            <div><dt>{tr('Last error', 'آخر خطأ')}</dt><dd>{access?.last_error ? String(access.last_error) : '—'}</dd></div>
          </dl>
        </section>
      )}
    </>
  );
}
