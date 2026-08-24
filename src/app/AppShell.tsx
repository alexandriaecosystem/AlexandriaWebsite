import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

type NavItem = { to: string; en: string; ar: string; icon: string; end?: boolean };
type NavGroup = { en: string; ar: string; items: NavItem[] };

const navigation: NavGroup[] = [
  {
    en: 'Overview', ar: 'نظرة عامة', items: [
      { to: '/', en: 'Dashboard', ar: 'الرئيسية', icon: '⌂', end: true },
    ],
  },
  {
    en: 'Community', ar: 'المجتمع', items: [
      { to: '/users', en: 'Users', ar: 'المستخدمون', icon: '◉' },
      { to: '/messages', en: 'Messages', ar: 'الرسائل', icon: '✉' },
      { to: '/reviews', en: 'Member reviews', ar: 'مراجعة الأعضاء', icon: '◎' },
      { to: '/community', en: 'Approved community', ar: 'المجتمع المعتمد', icon: '✓' },
    ],
  },
  {
    en: 'Knowledge', ar: 'المعرفة', items: [
      { to: '/knowledge', en: 'Knowledge base', ar: 'قاعدة المعرفة', icon: '◇' },
      { to: '/knowledge-gaps', en: 'Knowledge gaps', ar: 'فجوات المعرفة', icon: '?' },
    ],
  },
  {
    en: 'Communication', ar: 'التواصل', items: [
      { to: '/announcements', en: 'Announcements', ar: 'الإعلانات', icon: '↗' },
    ],
  },
  {
    en: 'Intelligence', ar: 'الذكاء', items: [
      { to: '/analytics', en: 'AI & costs', ar: 'الذكاء الاصطناعي والتكلفة', icon: '◫' },
      { to: '/ai-performance', en: 'AI performance', ar: 'أداء الذكاء الاصطناعي', icon: '▥' },
    ],
  },
  {
    en: 'Operations', ar: 'العمليات', items: [
      { to: '/activity', en: 'Activity log', ar: 'سجل النشاط', icon: '≡' },
    ],
  },
  {
    en: 'Admin', ar: 'الإدارة', items: [
      { to: '/settings', en: 'Settings', ar: 'الإعدادات', icon: '⚙' },
      { to: '/admin-users', en: 'Admin users', ar: 'المشرفون', icon: '♙' },
    ],
  },
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

        <nav aria-label={tr('Main menu', 'القائمة الرئيسية')}>
          {navigation.map((group) => (
            <div className="sidebar-nav-group" key={group.en}>
              <div className="sidebar-section-label">{tr(group.en, group.ar)}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{tr(item.en, item.ar)}</span>
                </NavLink>
              ))}
            </div>
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
