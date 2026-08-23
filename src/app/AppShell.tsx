import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

const navigation = [
  { to: '/', en: 'Overview', ar: 'نظرة عامة', icon: '⌂', end: true },
  { to: '/analytics', en: 'AI usage', ar: 'استخدام الذكاء الاصطناعي', icon: '◫' },
  { to: '/reviews', en: 'Review queue', ar: 'قائمة المراجعة', icon: '◎' },
  { to: '/knowledge', en: 'Knowledge base', ar: 'قاعدة المعرفة', icon: '◇' },
  { to: '/announcements', en: 'Announcements', ar: 'الإعلانات', icon: '↗' },
  { to: '/dead-letter', en: 'Dead-letter', ar: 'العمليات الفاشلة', icon: '!' },
];

export function AppShell() {
  const navigate = useNavigate();
  const { tr } = useLanguage();

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div>
            <strong>Alexandria</strong>
            <small>{tr('Admin console', 'لوحة الإدارة')}</small>
          </div>
        </div>

        <LanguageToggle />

        <div className="sidebar-section-label">{tr('Workspace', 'مساحة العمل')}</div>
        <nav aria-label={tr('Primary navigation', 'التنقل الرئيسي')}>
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{tr(item.en, item.ar)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="environment-status">
            <span className="status-dot" aria-hidden="true" />
            <span><strong>{tr('Protected', 'محمي')}</strong><small>{tr('Supabase admin session', 'جلسة إدارة Supabase')}</small></span>
          </div>
          <button type="button" className="text-button sign-out" onClick={signOut}>{tr('Sign out', 'تسجيل الخروج')}</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
