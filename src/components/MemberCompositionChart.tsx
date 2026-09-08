import { useLanguage } from '../i18n/LanguageContext';
import type { AccountCategory, MemberComposition } from '../services/member-composition';
import '../operational-ux.css';

export function MemberCompositionChart({ data }: { data: MemberComposition }) {
  const { tr } = useLanguage();
  const labels: Record<AccountCategory, string> = {
    telegram_premium: tr('Telegram Premium', 'Telegram Premium'),
    telegram_regular: tr('Telegram regular', 'Telegram عادي'),
    telegram_unknown: tr('Telegram · status unknown', 'Telegram · حالة الاشتراك غير معروفة'),
    whatsapp: tr('WhatsApp', 'WhatsApp'), discord: tr('Discord', 'Discord'), other: tr('Other platforms', 'منصات أخرى'),
  };
  if (!data.totalAccounts) return <p className="muted">{tr('No platform accounts recorded yet.', 'لم تُسجل حسابات على المنصات بعد.')}</p>;
  const visible = data.segments.filter((item) => item.count > 0);
  const description = `${data.totalAccounts} ${tr('platform accounts', 'حسابًا على المنصات')}. ${visible.map((item) => `${labels[item.category]}: ${item.count}`).join('; ')}`;
  return <>
    <div className="account-composition">
      <div className="account-donut" role="img" aria-label={description}>
        <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle className="account-track" cx="60" cy="60" r="48" />
          {visible.map((item, index) => {
            const size = item.count / data.totalAccounts * 100;
            const offset = visible.slice(0, index).reduce((sum, segment) => sum + segment.count, 0) / data.totalAccounts * 100;
            return <circle key={item.category} className={`account-segment account-${item.category}`} cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${size} ${100 - size}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
          })}
        </svg>
        <span aria-hidden="true"><strong>{data.totalAccounts.toLocaleString()}</strong><small>{tr('accounts', 'حسابات')}</small></span>
      </div>
      <dl className="account-legend">{visible.map((item) => <div key={item.category}>
        <dt><i aria-hidden="true" className={`account-key account-${item.category}`} />{labels[item.category]}</dt>
        <dd><strong>{item.count.toLocaleString()}</strong><small>{Math.round(item.count / data.totalAccounts * 100)}%</small></dd>
      </div>)}</dl>
    </div>
    <p className="account-explanation muted">{tr(`${data.linkedMembers.toLocaleString()} linked members. A member can have accounts on more than one platform.`, `${data.linkedMembers.toLocaleString()} أعضاء مرتبطين. يمكن للعضو امتلاك حسابات على أكثر من منصة.`)}</p>
    <small className="muted">{tr('Subscription status is shown only when verified. WhatsApp subscription type is not tracked.', 'تظهر حالة الاشتراك فقط عند التحقق منها. لا يُتتبع نوع اشتراك WhatsApp.')}</small>
  </>;
}
