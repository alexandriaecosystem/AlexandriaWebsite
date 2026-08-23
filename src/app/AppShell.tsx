import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

const navigation = [
  { to: '/', en: 'Dashboard', ar: 'الرئيسية', icon: '⌂', end: true },
  { to: '/reviews', en: 'Member reviews', ar: 'مراجعة الأعضاء', icon: '◎' },
  { to: '/knowledge', en: 'Knowledge', ar: 'المعرفة', icon: '◇' },
  { to: '/announcements', en: 'Announcements', ar: 'الإعلانات', icon: '↗' },
  { to: '/analytics', en: 'AI & costs', ar: 'الذكاء الاصطناعي والتكلفة', icon: '◫' },
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
            <small>{tr('Community admin', 'إدارة المجتمع')}</small>
          </div>
        </div>

        <LanguageToggle />

        <div className="sidebar-section-label">{tr('Menu', 'القائمة')}</div>
        <nav aria-label={tr('Main menu', 'القائمة الرئيسية')}>
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
            <span><strong>{tr('Secure access', 'دخول آمن')}</strong><small>{tr('Administrator account', 'حساب المسؤول')}</small></span>
          </div>
          <button type="button" className="text-button sign-out" onClick={signOut}>{tr('Sign out', 'تسجيل الخروج')}</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
