import { useLanguage } from './LanguageContext';

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  return (
    <div className={`language-toggle ${compact ? 'compact' : ''}`} role="group" aria-label="Language">
      <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')} aria-pressed={language === 'en'}>EN</button>
      <button type="button" className={language === 'ar' ? 'active' : ''} onClick={() => setLanguage('ar')} aria-pressed={language === 'ar'}>العربية</button>
    </div>
  );
}
