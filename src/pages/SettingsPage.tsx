import { Link } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';

export function SettingsPage() {
  const { tr } = useLanguage();

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{tr('Administration', 'الإدارة')}</p>
          <h1>{tr('Settings', 'الإعدادات')}</h1>
          <p className="muted page-subtitle">{tr('Open the right control surface for AI behavior, platform operations, content and administrator security.', 'افتح لوحة التحكم المناسبة لسلوك الذكاء الاصطناعي وعمليات المنصات والمحتوى وأمان المسؤول.')}</p>
        </div>
      </header>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{tr('Control center', 'مركز التحكم')}</p>
            <h2>{tr('Operational controls', 'عناصر التحكم التشغيلية')}</h2>
            <p className="muted">{tr('These links lead to the existing source-of-truth screens instead of duplicating settings in multiple places.', 'تنقلك هذه الروابط إلى شاشات المصدر الأساسي الحالية بدلاً من تكرار الإعدادات في عدة أماكن.')}</p>
          </div>
        </div>
        <div className="metric-grid">
          <Link className="metric-card metric-link" to="/operations">
            <span>{tr('System & integrations', 'النظام والتكاملات')}</span>
            <strong>5</strong>
            <small>{tr('Platform signals, dead letters and retries', 'إشارات المنصات والعمليات المتوقفة وإعادة المحاولة')}</small>
          </Link>
          <Link className="metric-card metric-link" to="/messages">
            <span>{tr('AI takeover', 'التحكم البشري')}</span>
            <strong>AI</strong>
            <small>{tr('Schedule or cancel channel sleep windows', 'جدولة أو إلغاء فترات إيقاف الذكاء الاصطناعي للقنوات')}</small>
          </Link>
          <Link className="metric-card metric-link" to="/announcements">
            <span>{tr('Announcements', 'الإعلانات')}</span>
            <strong>5</strong>
            <small>{tr('Telegram, Discord, WhatsApp, X and Instagram delivery', 'الإرسال عبر Telegram وDiscord وWhatsApp وX وInstagram')}</small>
          </Link>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{tr('AI & knowledge', 'الذكاء الاصطناعي والمعرفة')}</p>
            <h2>{tr('Assistant configuration surfaces', 'واجهات إعداد المساعد')}</h2>
          </div>
        </div>
        <div className="attention-grid">
          <Link to="/knowledge"><span>{tr('Knowledge base', 'قاعدة المعرفة')}</span><strong>→</strong><small>{tr('Upload, process, approve and edit trusted sources', 'رفع المصادر الموثوقة ومعالجتها واعتمادها وتعديلها')}</small></Link>
          <Link to="/knowledge-gaps"><span>{tr('Knowledge gaps', 'فجوات المعرفة')}</span><strong>→</strong><small>{tr('Review unresolved questions and missing coverage', 'مراجعة الأسئلة غير المحلولة ونواقص التغطية')}</small></Link>
          <Link to="/analytics"><span>{tr('AI & costs', 'الذكاء الاصطناعي والتكلفة')}</span><strong>→</strong><small>{tr('Monitor provider usage, cache efficiency and spend', 'مراقبة استخدام المزود وكفاءة التخزين المؤقت والتكلفة')}</small></Link>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{tr('Security', 'الأمان')}</p>
            <h2>{tr('Administrator account', 'حساب المسؤول')}</h2>
            <p className="muted">{tr('Password, MFA and session controls remain isolated from operational settings.', 'تبقى كلمة المرور والمصادقة الثنائية والتحكم بالجلسات منفصلة عن الإعدادات التشغيلية.')}</p>
          </div>
          <Link className="inline-link" to="/account">{tr('Open account & security', 'فتح الحساب والأمان')} →</Link>
        </div>
      </section>
    </>
  );
}
