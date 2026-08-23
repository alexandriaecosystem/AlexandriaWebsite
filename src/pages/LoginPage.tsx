import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';

export function LoginPage() {
  const client = getSupabaseClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');

    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      navigate('/', { replace: true });
    } catch {
      setError('Unable to reach the authentication service. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div><strong>Alexandria</strong><small>Secure administration</small></div>
        </div>
        <p className="eyebrow">Admin portal</p>
        <h1>Welcome back</h1>
        <p className="muted">Sign in with an authorized administrator account to continue.</p>

        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="login-footnote">Access is checked again against the server-side administrator session after sign-in.</p>
      </section>
    </main>
  );
}
