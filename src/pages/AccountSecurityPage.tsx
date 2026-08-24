import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import '../account-security.css';

const MIN_PASSWORD_LENGTH = 10;

export function AccountSecurityPage() {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const passwordLongEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = Boolean(newPassword) && newPassword === confirmPassword;
  const canSubmit = Boolean(currentPassword && passwordLongEnough && passwordsMatch && currentPassword !== newPassword && !busy);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError('');
    const client = getSupabaseClient();

    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      const email = userData.user?.email;
      if (userError || !email) {
        throw new Error(tr('Your account could not be verified. Please sign in again.', 'تعذر التحقق من حسابك. يرجى تسجيل الدخول مرة أخرى.'));
      }

      const { error: reauthError } = await client.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) {
        throw new Error(tr('Current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.'));
      }

      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      await client.auth.signOut({ scope: 'global' });
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Password could not be changed.', 'تعذر تغيير كلمة المرور.'));
      setBusy(false);
    }
  }

  return (
    <>
      <header className="page-header account-security-header">
        <div>
          <p className="eyebrow">{tr('Account', 'الحساب')}</p>
          <h1>{tr('Account & security', 'الحساب والأمان')}</h1>
          <p className="muted page-subtitle">{tr('Manage the security of your administrator account.', 'إدارة أمان حساب المسؤول الخاص بك.')}</p>
        </div>
      </header>

      <div className="account-security-layout">
        <section className="panel account-password-panel">
          <div className="account-section-heading">
            <div>
              <p className="eyebrow">{tr('Password', 'كلمة المرور')}</p>
              <h2>{tr('Change password', 'تغيير كلمة المرور')}</h2>
            </div>
            <span className="account-lock" aria-hidden="true">●</span>
          </div>

          <p className="muted">{tr('Enter your current password before choosing a new one. After the change, all administrator sessions are signed out.', 'أدخل كلمة المرور الحالية قبل اختيار كلمة مرور جديدة. بعد التغيير، يتم تسجيل الخروج من جميع جلسات المسؤول.')}</p>

          <form className="account-password-form" onSubmit={changePassword}>
            <label>
              {tr('Current password', 'كلمة المرور الحالية')}
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </label>

            <label>
              {tr('New password', 'كلمة المرور الجديدة')}
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              <small className={newPassword && !passwordLongEnough ? 'helper error-text' : 'helper'}>
                {tr(`Use at least ${MIN_PASSWORD_LENGTH} characters.`, `استخدم ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`)}
              </small>
            </label>

            <label>
              {tr('Confirm new password', 'تأكيد كلمة المرور الجديدة')}
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={MIN_PASSWORD_LENGTH}
                required
              />
              {confirmPassword && !passwordsMatch && <small className="helper error-text">{tr('Passwords do not match.', 'كلمتا المرور غير متطابقتين.')}</small>}
            </label>

            {currentPassword && newPassword && currentPassword === newPassword && (
              <p className="form-error" role="alert">{tr('Choose a new password that is different from your current password.', 'اختر كلمة مرور جديدة مختلفة عن كلمة المرور الحالية.')}</p>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}

            <div className="account-password-actions">
              <button type="submit" className="primary" disabled={!canSubmit}>
                {busy ? tr('Changing password…', 'جارٍ تغيير كلمة المرور…') : tr('Change password', 'تغيير كلمة المرور')}
              </button>
            </div>
          </form>
        </section>

        <aside className="panel account-security-note">
          <p className="eyebrow">{tr('Security', 'الأمان')}</p>
          <h2>{tr('Administrator access', 'وصول المسؤول')}</h2>
          <p className="muted">{tr('Your password is handled by Supabase Auth and is never stored by the Alexandria frontend.', 'تتم معالجة كلمة المرور بواسطة Supabase Auth ولا يتم تخزينها في واجهة Alexandria.')}</p>
          <div className="account-security-points">
            <div><span>✓</span><p>{tr('Current password is verified before a change.', 'يتم التحقق من كلمة المرور الحالية قبل التغيير.')}</p></div>
            <div><span>✓</span><p>{tr('The new password is sent directly to Supabase Auth.', 'يتم إرسال كلمة المرور الجديدة مباشرة إلى Supabase Auth.')}</p></div>
            <div><span>✓</span><p>{tr('All sessions are signed out after a successful change.', 'يتم تسجيل الخروج من جميع الجلسات بعد نجاح التغيير.')}</p></div>
          </div>
        </aside>
      </div>
    </>
  );
}
