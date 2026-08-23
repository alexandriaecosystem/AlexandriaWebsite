import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';

const navigation = [
  { to: '/', label: 'Overview', icon: '⌂', end: true },
  { to: '/analytics', label: 'AI usage', icon: '◫' },
  { to: '/reviews', label: 'Review queue', icon: '◎' },
  { to: '/knowledge', label: 'Knowledge base', icon: '◇' },
  { to: '/announcements', label: 'Announcements', icon: '↗' },
  { to: '/dead-letter', label: 'Dead-letter', icon: '!' },
];

export function AppShell() {
  const navigate = useNavigate();

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
            <small>Admin console</small>
          </div>
        </div>

        <div className="sidebar-section-label">Workspace</div>
        <nav aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="environment-status">
            <span className="status-dot" aria-hidden="true" />
            <span><strong>Protected</strong><small>Supabase admin session</small></span>
          </div>
          <button type="button" className="text-button sign-out" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}
