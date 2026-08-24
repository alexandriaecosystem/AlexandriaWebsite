import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

export function LoginPage() {
  const client = getSupabaseClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { tr } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passwordChanged = Boolean((location.state as { passwordChanged?: boolean } | null)?.passwordChanged);

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
      setError(tr('Unable to reach the authentication service. Please try again.', 'تعذر الاتصال بخدمة المصادقة. حاول مرة أخرى.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-language"><LanguageToggle compact /></div>
      <section className="login-card">
        <div className="brand login-brand">
          <span className="brand-mark" aria-hidden="true">A</span>
          <div><strong>Alexandria</strong><small>{tr('Secure administration', 'إدارة آمنة')}</small></div>
        </div>
        <p className="eyebrow">{tr('Admin portal', 'بوابة الإدارة')}</p>
        <h1>{tr('Welcome back', 'مرحباً بعودتك')}</h1>
        <p className="muted">{tr('Sign in with an authorized administrator account to continue.', 'سجّل الدخول بحساب مسؤول مخوّل للمتابعة.')}</p>

        {passwordChanged && <p className="form-success" role="status">{tr('Password changed successfully. Sign in again with your new password.', 'تم تغيير كلمة المرور بنجاح. سجّل الدخول مرة أخرى باستخدام كلمة المرور الجديدة.')}</p>}

        <form onSubmit={submit}>
          <label>
            {tr('Email', 'البريد الإلكتروني')}
            <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" dir="ltr" />
          </label>
          <label>
            {tr('Password', 'كلمة المرور')}
            <input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" dir="ltr" />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary" disabled={busy || !email.trim() || !password}>{busy ? tr('Signing in…', 'جارٍ تسجيل الدخول…') : tr('Sign in', 'تسجيل الدخول')}</button>
        </form>
        <p className="login-footnote">{tr('Access is checked again against the server-side administrator session after sign-in.', 'يتم التحقق من صلاحية المسؤول مرة أخرى على الخادم بعد تسجيل الدخول.')}</p>
      </section>
    </main>
  );
}
