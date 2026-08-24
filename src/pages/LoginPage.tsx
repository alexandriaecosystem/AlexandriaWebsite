import { useEffect, useState, type FormEvent } from 'react';
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
  const [notice, setNotice] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const passwordChanged = Boolean((location.state as { passwordChanged?: boolean } | null)?.passwordChanged);

  async function continueAfterPassword() {
    const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;
    if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
      const { data: factors, error: factorError } = await client.auth.mfa.listFactors();
      if (factorError) throw factorError;
      const factor = factors.totp.find((item) => item.status === 'verified');
      if (!factor) throw new Error(tr('MFA is required but no verified authenticator was found.', 'المصادقة الثنائية مطلوبة ولكن لم يتم العثور على تطبيق مصادقة موثّق.'));
      setMfaFactorId(factor.id);
      return;
    }
    navigate('/', { replace: true });
  }

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(async ({ data }) => {
      if (!active || !data.session) return;
      try { await continueAfterPassword(); } catch { /* keep login visible */ }
    });
    return () => { active = false; };
    // The client is a stable singleton; running this once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) { setError(result.error.message); return; }
      await continueAfterPassword();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Unable to reach the authentication service. Please try again.', 'تعذر الاتصال بخدمة المصادقة. حاول مرة أخرى.'));
    } finally { setBusy(false); }
  }

  async function verifyMfa(event: FormEvent) {
    event.preventDefault();
    if (!mfaFactorId || mfaCode.trim().length < 6 || busy) return;
    setBusy(true); setError('');
    try {
      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({ factorId: mfaFactorId, code: mfaCode.trim() });
      if (verifyError) throw verifyError;
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('The verification code was not accepted.', 'لم يتم قبول رمز التحقق.'));
    } finally { setBusy(false); }
  }

  async function sendRecovery() {
    if (!email.trim() || busy) {
      if (!email.trim()) setError(tr('Enter your admin email first.', 'أدخل البريد الإلكتروني للمسؤول أولاً.'));
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: recoveryError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
      if (recoveryError) throw recoveryError;
      setNotice(tr('Password reset email sent. Open the link in that email to choose a new password.', 'تم إرسال رسالة إعادة تعيين كلمة المرور. افتح الرابط في البريد لاختيار كلمة مرور جديدة.'));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Password recovery could not be started.', 'تعذر بدء استعادة كلمة المرور.'));
    } finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <div className="login-language"><LanguageToggle compact /></div>
      <section className="login-card">
        <div className="brand login-brand"><span className="brand-mark" aria-hidden="true">A</span><div><strong>Alexandria</strong><small>{tr('Secure administration', 'إدارة آمنة')}</small></div></div>
        <p className="eyebrow">{mfaFactorId ? tr('Two-factor authentication', 'المصادقة الثنائية') : tr('Admin portal', 'بوابة الإدارة')}</p>
        <h1>{mfaFactorId ? tr('Enter verification code', 'أدخل رمز التحقق') : tr('Welcome back', 'مرحباً بعودتك')}</h1>
        <p className="muted">{mfaFactorId ? tr('Open your authenticator app and enter the current code.', 'افتح تطبيق المصادقة وأدخل الرمز الحالي.') : tr('Sign in with an authorized administrator account to continue.', 'سجّل الدخول بحساب مسؤول مخوّل للمتابعة.')}</p>

        {passwordChanged && !mfaFactorId && <p className="form-success" role="status">{tr('Password changed successfully. Sign in again with your new password.', 'تم تغيير كلمة المرور بنجاح. سجّل الدخول مرة أخرى باستخدام كلمة المرور الجديدة.')}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}

        {mfaFactorId ? (
          <form onSubmit={verifyMfa}>
            <label>{tr('Authentication code', 'رمز المصادقة')}<input type="text" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="123456" dir="ltr" required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary" disabled={busy || mfaCode.length < 6}>{busy ? tr('Verifying…', 'جارٍ التحقق…') : tr('Verify & continue', 'تحقق ومتابعة')}</button>
            <button type="button" className="text-button" onClick={() => { void client.auth.signOut({ scope: 'local' }); setMfaFactorId(null); setMfaCode(''); setPassword(''); }}>{tr('Use another account', 'استخدام حساب آخر')}</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label>{tr('Email', 'البريد الإلكتروني')}<input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" dir="ltr" /></label>
            <label>{tr('Password', 'كلمة المرور')}<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" dir="ltr" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary" disabled={busy || !email.trim() || !password}>{busy ? tr('Signing in…', 'جارٍ تسجيل الدخول…') : tr('Sign in', 'تسجيل الدخول')}</button>
            <button type="button" className="text-button login-recovery" disabled={busy} onClick={() => void sendRecovery()}>{tr('Forgot password?', 'نسيت كلمة المرور؟')}</button>
          </form>
        )}
        <p className="login-footnote">{tr('Access is checked again against the server-side administrator session after sign-in.', 'يتم التحقق من صلاحية المسؤول مرة أخرى على الخادم بعد تسجيل الدخول.')}</p>
      </section>
    </main>
  );
}
