import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { LanguageToggle } from '../i18n/LanguageToggle';
import { useLanguage } from '../i18n/LanguageContext';

const MIN_PASSWORD_LENGTH = 10;

export function ResetPasswordPage() {
  const client = getSupabaseClient();
  const navigate = useNavigate();
  const { tr } = useLanguage();
  const [ready, setReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) setError(tr('This reset link is invalid or has expired. Request a new password reset email.', 'رابط إعادة التعيين غير صالح أو انتهت صلاحيته. اطلب رسالة جديدة لإعادة تعيين كلمة المرور.'));
      else setReady(true);
    });
    return () => { active = false; };
  }, [client, tr]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || busy || newPassword.length < MIN_PASSWORD_LENGTH || newPassword !== confirmPassword) return;
    setBusy(true); setError('');
    try {
      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await client.auth.signOut({ scope: 'global' });
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Password could not be reset.', 'تعذر إعادة تعيين كلمة المرور.'));
      setBusy(false);
    }
  }

  return <main className="login-page">
    <div className="login-language"><LanguageToggle compact /></div>
    <section className="login-card">
      <div className="brand login-brand"><span className="brand-mark" aria-hidden="true">A</span><div><strong>Alexandria</strong><small>{tr('Secure administration', 'إدارة آمنة')}</small></div></div>
      <p className="eyebrow">{tr('Password recovery', 'استعادة كلمة المرور')}</p>
      <h1>{tr('Choose a new password', 'اختر كلمة مرور جديدة')}</h1>
      <p className="muted">{tr('The reset link must be opened from the recovery email sent by Supabase Auth.', 'يجب فتح رابط إعادة التعيين من رسالة الاستعادة المرسلة بواسطة Supabase Auth.')}</p>
      <form onSubmit={submit}>
        <label>{tr('New password', 'كلمة المرور الجديدة')}<input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required disabled={!ready} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><small className="helper">{tr(`Use at least ${MIN_PASSWORD_LENGTH} characters.`, `استخدم ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`)}</small></label>
        <label>{tr('Confirm new password', 'تأكيد كلمة المرور الجديدة')}<input type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required disabled={!ready} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        {confirmPassword && newPassword !== confirmPassword && <p className="form-error" role="alert">{tr('Passwords do not match.', 'كلمتا المرور غير متطابقتين.')}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary" disabled={!ready || busy || newPassword.length < MIN_PASSWORD_LENGTH || newPassword !== confirmPassword}>{busy ? tr('Updating…', 'جارٍ التحديث…') : tr('Set new password', 'تعيين كلمة المرور الجديدة')}</button>
      </form>
    </section>
  </main>;
}
