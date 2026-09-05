import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';
import { AdminAgentPanel } from '../components/AdminAgentPanel';
import { NavIcon, type NavIconName } from '../components/NavIcon';
import alexandriaLogo from '../assets/alexandria-logo.svg';
import './AppShell.css';

type NavItem = { to: string; en: string; ar: string; icon: NavIconName; end?: boolean };
type NavGroup = { en: string; ar: string; items: NavItem[] };

const navigation: NavGroup[] = [
  { en: 'Workspace', ar: 'مساحة العمل', items: [
    { to: '/', en: 'Dashboard', ar: 'الرئيسية', icon: 'dashboard', end: true },
    { to: '/knowledge', en: 'Knowledge base', ar: 'قاعدة المعرفة', icon: 'knowledge' },
  ] },
  { en: 'Community', ar: 'المجتمع', items: [
    { to: '/users', en: 'Users', ar: 'المستخدمون', icon: 'users' },
    { to: '/messages', en: 'Messages', ar: 'الرسائل', icon: 'messages' },
    { to: '/reviews', en: 'Member reviews', ar: 'مراجعة الأعضاء', icon: 'reviews' },
    { to: '/community', en: 'Approved community', ar: 'المجتمع المعتمد', icon: 'community' },
  ] },
  { en: 'Content', ar: 'المحتوى', items: [
    { to: '/knowledge-gaps', en: 'Knowledge gaps', ar: 'فجوات المعرفة', icon: 'gaps' },
    { to: '/announcements', en: 'Announcements', ar: 'الإعلانات', icon: 'announcements' },
  ] },
  { en: 'Insights', ar: 'المؤشرات', items: [
    { to: '/analytics', en: 'AI & costs', ar: 'الذكاء الاصطناعي والتكلفة', icon: 'analytics' },
    { to: '/token-monitor', en: 'Token activity', ar: 'نشاط التوكن', icon: 'token' },
  ] },
  { en: 'Admin', ar: 'الإدارة', items: [
    { to: '/settings', en: 'Settings', ar: 'الإعدادات', icon: 'settings' },
    { to: '/operations', en: 'System & integrations', ar: 'النظام والتكاملات', icon: 'operations' },
    { to: '/account', en: 'Account & security', ar: 'الحساب والأمان', icon: 'account' },
  ] },
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tr } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  async function signOut() {
    await getSupabaseClient().auth.signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div className={`app-shell ${menuOpen ? 'mobile-menu-open' : ''}`}>
      <a className="skip-link" href="#main-content">{tr('Skip to content', 'انتقل إلى المحتوى')}</a>

      <header className="mobile-topbar">
        <button type="button" className="mobile-menu-button" aria-expanded={menuOpen} aria-controls="admin-sidebar" onClick={() => setMenuOpen((value) => !value)}>
          <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
          <span className="sr-only">{menuOpen ? tr('Close menu', 'إغلاق القائمة') : tr('Open menu', 'فتح القائمة')}</span>
        </button>
        <div className="mobile-brand brand-lockup">
          <img src={alexandriaLogo} alt="" aria-hidden="true" />
          <span><strong>Alexandria</strong><small>{tr('Community admin', 'إدارة المجتمع')}</small></span>
        </div>
        <NavLink className="mobile-knowledge-link" to="/knowledge" aria-label={tr('Knowledge base', 'قاعدة المعرفة')}>
          <NavIcon name="knowledge" />
        </NavLink>
      </header>

      <button type="button" className="sidebar-backdrop" aria-label={tr('Close navigation', 'إغلاق التنقل')} onClick={() => setMenuOpen(false)} tabIndex={menuOpen ? 0 : -1} />

      <aside id="admin-sidebar" className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label={tr('Administration navigation', 'تنقل الإدارة')}>
        <div className="sidebar-mobile-head">
          <div className="brand brand-lockup">
            <img className="brand-logo" src={alexandriaLogo} alt="" aria-hidden="true" />
            <div>
              <strong>Alexandria</strong>
              <small>{tr('Community admin', 'إدارة المجتمع')}</small>
            </div>
          </div>
          <button type="button" className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label={tr('Close menu', 'إغلاق القائمة')}>×</button>
        </div>

        <LanguageToggle />

        <nav aria-label={tr('Main menu', 'القائمة الرئيسية')}>
          {navigation.map((group) => (
            <div className="sidebar-nav-group" key={group.en}>
              <div className="sidebar-section-label">{tr(group.en, group.ar)}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMenuOpen(false)}>
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  <span>{tr(item.en, item.ar)}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="text-button sign-out" onClick={() => void signOut()}>{tr('Sign out', 'تسجيل الخروج')}</button>
        </div>
      </aside>
      <main id="main-content" className="content" tabIndex={-1}><Outlet /></main>
      <AdminAgentPanel />
    </div>
  );
}
