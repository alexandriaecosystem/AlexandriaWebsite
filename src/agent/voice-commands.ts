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
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
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
      /^(?:abre|muestra|ve a|ir a) (?:el )?(?:panel|dashboard|inicio)$/,
      /^(?:ouvre|affiche|va a) (?:le )?(?:tableau de bord|dashboard)$/,
      /^(?:offne|zeige|gehe zu) (?:das )?(?:dashboard|ubersicht)$/,
      /^(?:apri|mostra|vai a) (?:il )?(?:dashboard|pannello)$/,
      /^(?:abra|mostre|va para) (?:o )?(?:painel|dashboard|inicio)$/,
    ],
  },
  {
    route: routes.analytics,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?analytics$/,
      /^(?:open|show) (?:the )?analytics$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:التحليلات|تحليلات)$/,
      /^(?:افتح|اعرض) (?:التحليلات|تحليلات)$/,
      /^(?:abre|muestra|ve a) (?:las )?(?:analiticas|analytics)$/,
      /^(?:ouvre|affiche|va a) (?:les )?(?:analyses|analytics)$/,
      /^(?:offne|zeige|gehe zu) (?:die )?(?:analysen|analytics)$/,
      /^(?:apri|mostra|vai a) (?:le )?(?:analisi|analytics)$/,
      /^(?:abra|mostre|va para) (?:as )?(?:analises|analytics)$/,
    ],
  },
  {
    route: routes.knowledge,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?knowledge(?: base)?$/,
      /^(?:open|show) (?:the )?knowledge(?: base)?$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? قاعدة المعرفة$/,
      /^(?:افتح|اعرض) قاعدة المعرفة$/,
      /^(?:abre|muestra|ve a) (?:la )?(?:base de conocimientos|base de conocimiento)$/,
      /^(?:ouvre|affiche|va a) (?:la )?base de connaissances$/,
      /^(?:offne|zeige|gehe zu) (?:die )?(?:wissensdatenbank|wissensbasis)$/,
      /^(?:apri|mostra|vai a) (?:la )?base di conoscenza$/,
      /^(?:abra|mostre|va para) (?:a )?base de conhecimento$/,
    ],
  },
  {
    route: routes.users,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?users$/,
      /^(?:open|show) (?:the )?users$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? المستخدمين$/,
      /^(?:افتح|اعرض) المستخدمين$/,
      /^(?:abre|muestra|ve a) (?:los )?usuarios$/,
      /^(?:ouvre|affiche|va a) (?:les )?utilisateurs$/,
      /^(?:offne|zeige|gehe zu) (?:die )?benutzer$/,
      /^(?:apri|mostra|vai a) (?:gli )?utenti$/,
      /^(?:abra|mostre|va para) (?:os )?usuarios$/,
    ],
  },
  {
    route: routes.messages,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?messages$/,
      /^(?:open|show) (?:the )?messages$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? الرسائل$/,
      /^(?:افتح|اعرض) الرسائل$/,
      /^(?:abre|muestra|ve a) (?:los )?mensajes$/,
      /^(?:ouvre|affiche|va a) (?:les )?messages$/,
      /^(?:offne|zeige|gehe zu) (?:die )?nachrichten$/,
      /^(?:apri|mostra|vai a) (?:i )?messaggi$/,
      /^(?:abra|mostre|va para) (?:as )?mensagens$/,
    ],
  },
  {
    route: routes.reviews,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:member )?reviews$/,
      /^(?:open|show) (?:the )?(?:member )?reviews$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? مراجعة الأعضاء$/,
      /^(?:افتح|اعرض) مراجعة الأعضاء$/,
      /^(?:abre|muestra) (?:las )?revisiones(?: de miembros)?$/,
      /^(?:ouvre|affiche) (?:les )?evaluations(?: des membres)?$/,
      /^(?:offne|zeige) (?:die )?(?:mitgliederbewertungen|bewertungen)$/,
      /^(?:apri|mostra) (?:le )?revisioni(?: membri)?$/,
      /^(?:abra|mostre) (?:as )?revisoes(?: de membros)?$/,
    ],
  },
  {
    route: routes.community,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:approved|vip) community$/,
      /^(?:open|show) (?:the )?(?:approved|vip) community$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:المجتمع المعتمد|مجتمع vip)$/,
      /^(?:افتح|اعرض) (?:المجتمع المعتمد|مجتمع vip)$/,
      /^(?:abre|muestra) (?:la )?(?:comunidad aprobada|comunidad vip)$/,
      /^(?:ouvre|affiche) (?:la )?(?:communaute approuvee|communaute vip)$/,
      /^(?:offne|zeige) (?:die )?(?:genehmigte community|vip community)$/,
      /^(?:apri|mostra) (?:la )?(?:community approvata|community vip)$/,
      /^(?:abra|mostre) (?:a )?(?:comunidade aprovada|comunidade vip)$/,
    ],
  },
  {
    route: routes.announcements,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?announcements$/,
      /^(?:open|show) (?:the )?announcements$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? الإعلانات$/,
      /^(?:افتح|اعرض) الإعلانات$/,
      /^(?:abre|muestra|ve a) (?:los )?anuncios$/,
      /^(?:ouvre|affiche|va a) (?:les )?annonces$/,
      /^(?:offne|zeige|gehe zu) (?:die )?(?:ankundigungen|ankundigung)$/,
      /^(?:apri|mostra|vai a) (?:gli )?annunci$/,
      /^(?:abra|mostre|va para) (?:os )?anuncios$/,
    ],
  },
  {
    route: routes.tokens,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:token activity|token monitor)$/,
      /^(?:open|show) (?:the )?(?:token activity|token monitor)$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? نشاط التوكن$/,
      /^(?:افتح|اعرض) نشاط التوكن$/,
      /^(?:abre|muestra) (?:la )?(?:actividad del token|monitor de token)$/,
      /^(?:ouvre|affiche) (?:l )?(?:activite du token|moniteur de token)$/,
      /^(?:offne|zeige) (?:die )?(?:token aktivitat|token monitor)$/,
      /^(?:apri|mostra) (?:la )?(?:attivita token|monitor token)$/,
      /^(?:abra|mostre) (?:a )?(?:atividade do token|monitor de token)$/,
    ],
  },
  {
    route: routes.account,
    patterns: [
      /^(?:go|take me|navigate) to (?:the )?(?:account|account security|security)$/,
      /^(?:open|show) (?:the )?(?:account|account security|security)$/,
      /^(?:اذهب|روح|انتقل)(?: إلى| الى)? (?:الحساب|الأمان|الحساب والأمان)$/,
      /^(?:افتح|اعرض) (?:الحساب|الأمان|الحساب والأمان)$/,
      /^(?:abre|muestra) (?:la )?(?:cuenta|seguridad|seguridad de la cuenta)$/,
      /^(?:ouvre|affiche) (?:le )?(?:compte|securite|securite du compte)$/,
      /^(?:offne|zeige) (?:das )?(?:konto|sicherheit|kontosicherheit)$/,
      /^(?:apri|mostra) (?:l )?(?:account|sicurezza|sicurezza account)$/,
      /^(?:abra|mostre) (?:a )?(?:conta|seguranca|seguranca da conta)$/,
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
