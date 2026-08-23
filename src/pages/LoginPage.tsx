import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';

export function LoginPage() {
  const client = getSupabaseClient(); const navigate = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    const result = await client.auth.signInWithPassword({ email, password });
    setBusy(false); if (result.error) return setError(result.error.message);
    setAuthenticated(true); navigate('/');
  }
  if (authenticated) return <Navigate to="/" replace />;
  return <main className="login-page"><section className="login-card">
    <div className="brand login-brand"><span className="brand-mark">A</span><div><strong>Alexandria</strong><small>Secure administration</small></div></div>
    <p className="eyebrow">Admin portal</p><h1>Welcome back</h1>
    <p className="muted">Sign in with an authorized Supabase administrator account.</p>
    <form onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </section></main>;
}
