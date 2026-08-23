import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';

export function AppShell() {
  const navigate = useNavigate();
  async function signOut() { await getSupabaseClient().auth.signOut(); navigate('/login'); }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">A</span><div><strong>Alexandria</strong><small>Community control</small></div></div>
      <nav aria-label="Primary navigation">
        <NavLink to="/" end>Overview</NavLink>
        <NavLink to="/reviews">Review queue</NavLink>
        <NavLink to="/announcements">Announcements</NavLink>
        <NavLink to="/dead-letter">Dead-letter</NavLink>
      </nav>
      <button className="text-button sign-out" onClick={signOut}>Sign out</button>
    </aside>
    <main className="content"><Outlet /></main>
  </div>;
}
