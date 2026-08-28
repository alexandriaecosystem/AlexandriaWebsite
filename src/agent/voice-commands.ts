const routes = {
  dashboard: '/',
  analytics: '/analytics',
  knowledge: '/knowledge',
  users: '/users',
  messages: '/messages',
  reviews: '/reviews',
  community: '/community',
  announcements: '/announcements',
  tokens: '/token-monitor',
  account: '/account',
} as const;

function normalizeTranscript(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[!?.,،؟؛:]/g, ' ')
    .replace(/\s+/g, ' ');
}

const navigationPatterns: Array<{ route: string; patterns: RegExp[] }> = [
  {
    route: routes.dashboard,
    patterns: [
      /^(?:go|take me|navigate)(?: back)? to (?:the )?dashboard$/,
      /^(?:open|show) (?:the )?dashboard$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:لوحة التحكم|الرئيسية)$/,
      /^(?:افتح|اعرض) (?:لوحة التحكم|الرئيسية)$/,
    ],
  },
  {
    route: routes.analytics,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?analytics$/,
      /^(?:open|show) (?:the )?analytics$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:التحليلات|تحليلات)$/,
      /^(?:افتح|اعرض) (?:التحليلات|تحليلات)$/,
    ],
  },
  {
    route: routes.knowledge,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?knowledge(?: base)?$/,
      /^(?:open|show) (?:the )?knowledge(?: base)?$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? قاعدة المعرفة$/,
      /^(?:افتح|اعرض) قاعدة المعرفة$/,
    ],
  },
  {
    route: routes.users,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?users$/,
      /^(?:open|show) (?:the )?users$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? المستخدمين$/,
      /^(?:افتح|اعرض) المستخدمين$/,
    ],
  },
  {
    route: routes.messages,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?messages$/,
      /^(?:open|show) (?:the )?messages$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? الرسائل$/,
      /^(?:افتح|اعرض) الرسائل$/,
    ],
  },
  {
    route: routes.reviews,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:member )?reviews$/,
      /^(?:open|show) (?:the )?(?:member )?reviews$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? مراجعة الأعضاء$/,
      /^(?:افتح|اعرض) مراجعة الأعضاء$/,
    ],
  },
  {
    route: routes.community,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:approved|vip) community$/,
      /^(?:open|show) (?:the )?(?:approved|vip) community$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:المجتمع المعتمد|مجتمع vip)$/,
      /^(?:افتح|اعرض) (?:المجتمع المعتمد|مجتمع vip)$/,
    ],
  },
  {
    route: routes.announcements,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?announcements$/,
      /^(?:open|show) (?:the )?announcements$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? الإعلانات$/,
      /^(?:افتح|اعرض) الإعلانات$/,
    ],
  },
  {
    route: routes.tokens,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:token activity|token monitor)$/,
      /^(?:open|show) (?:the )?(?:token activity|token monitor)$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? نشاط التوكن$/,
      /^(?:افتح|اعرض) نشاط التوكن$/,
    ],
  },
  {
    route: routes.account,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:account|account security|security)$/,
      /^(?:open|show) (?:the )?(?:account|account security|security)$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:الحساب|الأمان|الحساب والأمان)$/,
      /^(?:افتح|اعرض) (?:الحساب|الأمان|الحساب والأمان)$/,
    ],
  },
];

export function resolveVoiceNavigation(transcript: string): string | null {
  const normalized = normalizeTranscript(transcript);
  if (!normalized) return null;
  for (const item of navigationPatterns) {
    if (item.patterns.some((pattern) => pattern.test(normalized))) return item.route;
  }
  return null;
}
