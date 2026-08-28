import type { AppLanguage } from '../i18n/LanguageContext';

export type AdminPageContext = {
  pathname: string;
  page: string;
  pageLabel: string;
  language: AppLanguage;
  entity?: { type: 'user' | 'application'; id: string };
};

const labels: Record<string, { en: string; ar: string }> = {
  dashboard: { en: 'Dashboard', ar: 'لوحة التحكم' },
  users: { en: 'Users', ar: 'المستخدمون' },
  user_detail: { en: 'User details', ar: 'تفاصيل المستخدم' },
  messages: { en: 'Messages', ar: 'الرسائل' },
  reviews: { en: 'Member reviews', ar: 'مراجعة الأعضاء' },
  review_detail: { en: 'Member review', ar: 'مراجعة العضو' },
  community: { en: 'Approved community', ar: 'المجتمع المعتمد' },
  knowledge: { en: 'Knowledge base', ar: 'قاعدة المعرفة' },
  knowledge_gaps: { en: 'Knowledge gaps', ar: 'فجوات المعرفة' },
  announcements: { en: 'Announcements', ar: 'الإعلانات' },
  analytics: { en: 'AI & costs', ar: 'الذكاء الاصطناعي والتكلفة' },
  token_monitor: { en: 'Token activity', ar: 'نشاط التوكن' },
  account: { en: 'Account & security', ar: 'الحساب والأمان' },
  unknown: { en: 'Admin page', ar: 'صفحة الإدارة' },
};

function context(pathname: string, page: keyof typeof labels, language: AppLanguage, entity?: AdminPageContext['entity']): AdminPageContext {
  return {
    pathname,
    page,
    pageLabel: labels[page][language],
    language,
    ...(entity ? { entity } : {}),
  };
}

export function buildAdminPageContext(pathname: string, language: AppLanguage): AdminPageContext {
  const cleanPath = pathname.split('?')[0].replace(/\/+$/, '') || '/';
  if (cleanPath === '/') return context(pathname, 'dashboard', language);

  const userMatch = cleanPath.match(/^\/users\/([^/]+)$/);
  if (userMatch) return context(pathname, 'user_detail', language, { type: 'user', id: decodeURIComponent(userMatch[1]) });

  const reviewMatch = cleanPath.match(/^\/reviews\/([^/]+)$/);
  if (reviewMatch) return context(pathname, 'review_detail', language, { type: 'application', id: decodeURIComponent(reviewMatch[1]) });

  const routes: Record<string, keyof typeof labels> = {
    '/users': 'users',
    '/messages': 'messages',
    '/reviews': 'reviews',
    '/community': 'community',
    '/knowledge': 'knowledge',
    '/knowledge-gaps': 'knowledge_gaps',
    '/announcements': 'announcements',
    '/analytics': 'analytics',
    '/token-monitor': 'token_monitor',
    '/account': 'account',
    '/settings': 'account',
  };

  return context(pathname, routes[cleanPath] ?? 'unknown', language);
}
