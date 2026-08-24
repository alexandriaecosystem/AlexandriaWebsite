import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { useLanguage } from '../i18n/LanguageContext';
import '../account-security.css';

const MIN_PASSWORD_LENGTH = 10;

type MfaEnrollment = { factorId: string; qrCode: string; secret: string };

export function AccountSecurityPage() {
  const { tr } = useLanguage();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(true);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [securityBusy, setSecurityBusy] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [securityError, setSecurityError] = useState('');

  const passwordLongEnough = newPassword.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = Boolean(newPassword) && newPassword === confirmPassword;
  const canSubmit = Boolean(currentPassword && passwordLongEnough && passwordsMatch && currentPassword !== newPassword && !busy);

  async function refreshMfa() {
    const client = getSupabaseClient();
    setMfaLoading(true);
    const { data, error: factorError } = await client.auth.mfa.listFactors();
    if (factorError) {
      setSecurityError(factorError.message);
      setMfaLoading(false);
      return;
    }
    const verified = data.totp.find((factor) => factor.status === 'verified');
    setVerifiedFactorId(verified?.id ?? null);
    setMfaLoading(false);
  }

  useEffect(() => { void refreshMfa(); }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setError('');
    const client = getSupabaseClient();
    try {
      const { data: userData, error: userError } = await client.auth.getUser();
      const email = userData.user?.email;
      if (userError || !email) throw new Error(tr('Your account could not be verified. Please sign in again.', 'تعذر التحقق من حسابك. يرجى تسجيل الدخول مرة أخرى.'));
      const { error: reauthError } = await client.auth.signInWithPassword({ email, password: currentPassword });
      if (reauthError) throw new Error(tr('Current password is incorrect.', 'كلمة المرور الحالية غير صحيحة.'));
      const { error: updateError } = await client.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await client.auth.signOut({ scope: 'global' });
      navigate('/login', { replace: true, state: { passwordChanged: true } });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : tr('Password could not be changed.', 'تعذر تغيير كلمة المرور.'));
      setBusy(false);
    }
  }

  async function startMfaEnrollment() {
    if (securityBusy) return;
    setSecurityBusy(true); setSecurityError(''); setSecurityMessage('');
    try {
      const client = getSupabaseClient();
      const { data, error: enrollError } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Alexandria admin ${Date.now()}` });
      if (enrollError) throw enrollError;
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : tr('MFA setup could not start.', 'تعذر بدء إعداد المصادقة الثنائية.'));
    } finally { setSecurityBusy(false); }
  }

  async function verifyMfa() {
    if (!enrollment || mfaCode.trim().length < 6 || securityBusy) return;
    setSecurityBusy(true); setSecurityError(''); setSecurityMessage('');
    try {
      const { error: verifyError } = await getSupabaseClient().auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: mfaCode.trim() });
      if (verifyError) throw verifyError;
      setEnrollment(null); setMfaCode('');
      setSecurityMessage(tr('Two-factor authentication is now enabled.', 'تم تفعيل المصادقة الثنائية.'));
      await refreshMfa();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : tr('The verification code was not accepted.', 'لم يتم قبول رمز التحقق.'));
    } finally { setSecurityBusy(false); }
  }

  async function disableMfa() {
    if (!verifiedFactorId || securityBusy) return;
    if (!window.confirm(tr('Disable two-factor authentication for this admin account?', 'هل تريد تعطيل المصادقة الثنائية لهذا الحساب؟'))) return;
    setSecurityBusy(true); setSecurityError(''); setSecurityMessage('');
    try {
      const { error: unenrollError } = await getSupabaseClient().auth.mfa.unenroll({ factorId: verifiedFactorId });
      if (unenrollError) throw unenrollError;
      setSecurityMessage(tr('Two-factor authentication was disabled.', 'تم تعطيل المصادقة الثنائية.'));
      await refreshMfa();
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : tr('MFA could not be disabled.', 'تعذر تعطيل المصادقة الثنائية.'));
    } finally { setSecurityBusy(false); }
  }

  async function signOutOtherDevices() {
    if (securityBusy) return;
    setSecurityBusy(true); setSecurityError(''); setSecurityMessage('');
    try {
      const { error: signOutError } = await getSupabaseClient().auth.signOut({ scope: 'others' });
      if (signOutError) throw signOutError;
      setSecurityMessage(tr('Other sessions were signed out. This session remains active.', 'تم تسجيل الخروج من الجلسات الأخرى. تبقى هذه الجلسة نشطة.'));
    } catch (caught) {
      setSecurityError(caught instanceof Error ? caught.message : tr('Other sessions could not be signed out.', 'تعذر تسجيل الخروج من الجلسات الأخرى.'));
    } finally { setSecurityBusy(false); }
  }

  return (
    <>
      <header className="page-header account-security-header"><div><p className="eyebrow">{tr('Account', 'الحساب')}</p><h1>{tr('Account & security', 'الحساب والأمان')}</h1><p className="muted page-subtitle">{tr('Manage the security of your administrator account.', 'إدارة أمان حساب المسؤول الخاص بك.')}</p></div></header>

      <div className="account-security-layout">
        <section className="panel account-password-panel">
          <div className="account-section-heading"><div><p className="eyebrow">{tr('Password', 'كلمة المرور')}</p><h2>{tr('Change password', 'تغيير كلمة المرور')}</h2></div><span className="account-lock" aria-hidden="true">●</span></div>
          <p className="muted">{tr('Enter your current password before choosing a new one. After the change, all administrator sessions are signed out.', 'أدخل كلمة المرور الحالية قبل اختيار كلمة مرور جديدة. بعد التغيير، يتم تسجيل الخروج من جميع جلسات المسؤول.')}</p>
          <form className="account-password-form" onSubmit={changePassword}>
            <label>{tr('Current password', 'كلمة المرور الحالية')}<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
            <label>{tr('New password', 'كلمة المرور الجديدة')}<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={MIN_PASSWORD_LENGTH} required /><small className={newPassword && !passwordLongEnough ? 'helper error-text' : 'helper'}>{tr(`Use at least ${MIN_PASSWORD_LENGTH} characters.`, `استخدم ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`)}</small></label>
            <label>{tr('Confirm new password', 'تأكيد كلمة المرور الجديدة')}<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={MIN_PASSWORD_LENGTH} required />{confirmPassword && !passwordsMatch && <small className="helper error-text">{tr('Passwords do not match.', 'كلمتا المرور غير متطابقتين.')}</small>}</label>
            {currentPassword && newPassword && currentPassword === newPassword && <p className="form-error" role="alert">{tr('Choose a new password that is different from your current password.', 'اختر كلمة مرور جديدة مختلفة عن كلمة المرور الحالية.')}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="account-password-actions"><button type="submit" className="primary" disabled={!canSubmit}>{busy ? tr('Changing password…', 'جارٍ تغيير كلمة المرور…') : tr('Change password', 'تغيير كلمة المرور')}</button></div>
          </form>
        </section>

        <div className="account-security-stack">
          <section className="panel account-security-note">
            <p className="eyebrow">{tr('Two-factor authentication', 'المصادقة الثنائية')}</p>
            <h2>{mfaLoading ? tr('Checking MFA…', 'جارٍ التحقق…') : verifiedFactorId ? tr('MFA is enabled', 'المصادقة الثنائية مفعلة') : tr('Protect this admin account', 'حماية حساب المسؤول')}</h2>
            <p className="muted">{tr('Use an authenticator app to require a one-time code after the password.', 'استخدم تطبيق مصادقة لطلب رمز مؤقت بعد كلمة المرور.')}</p>
            {!mfaLoading && !verifiedFactorId && !enrollment && <button type="button" className="primary" disabled={securityBusy} onClick={() => void startMfaEnrollment()}>{tr('Set up MFA', 'إعداد المصادقة الثنائية')}</button>}
            {enrollment && <div className="mfa-enrollment"><img src={enrollment.qrCode} alt={tr('Authenticator QR code', 'رمز QR لتطبيق المصادقة')} /><p className="muted">{tr('Scan this QR code with your authenticator app, then enter the 6-digit code.', 'امسح رمز QR باستخدام تطبيق المصادقة ثم أدخل الرمز المكوّن من 6 أرقام.')}</p><details><summary>{tr('Cannot scan?', 'لا يمكنك المسح؟')}</summary><code dir="ltr">{enrollment.secret}</code></details><div className="mfa-code-row"><input value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" dir="ltr" /><button type="button" className="primary" disabled={securityBusy || mfaCode.length < 6} onClick={() => void verifyMfa()}>{tr('Verify', 'تحقق')}</button></div></div>}
            {verifiedFactorId && <button type="button" className="compact-button danger" disabled={securityBusy} onClick={() => void disableMfa()}>{tr('Disable MFA', 'تعطيل المصادقة الثنائية')}</button>}
          </section>

          <section className="panel account-security-note"><p className="eyebrow">{tr('Sessions', 'الجلسات')}</p><h2>{tr('Other devices', 'الأجهزة الأخرى')}</h2><p className="muted">{tr('If you signed in on another computer or browser, you can revoke those sessions while keeping this one open.', 'إذا سجلت الدخول على جهاز أو متصفح آخر، يمكنك إلغاء تلك الجلسات مع إبقاء هذه الجلسة مفتوحة.')}</p><button type="button" className="compact-button" disabled={securityBusy} onClick={() => void signOutOtherDevices()}>{tr('Sign out other devices', 'تسجيل الخروج من الأجهزة الأخرى')}</button></section>

          {(securityError || securityMessage) && <p className={securityError ? 'form-error' : 'form-success'} role="status">{securityError || securityMessage}</p>}
        </div>
      </div>
    </>
  );
}
