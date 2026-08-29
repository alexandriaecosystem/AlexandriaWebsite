import type { ReactNode } from 'react';

export type NavIconName = 'dashboard' | 'users' | 'messages' | 'reviews' | 'community' | 'knowledge' | 'gaps' | 'announcements' | 'analytics' | 'token' | 'account';

const glyphs: Record<NavIconName, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  messages: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
  reviews: <><path d="M12 3l2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z"/></>,
  community: <><path d="M20 7l-9 9-4-4"/><circle cx="12" cy="12" r="9"/></>,
  knowledge: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22z"/></>,
  gaps: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 4.3 2c-1 .7-1.8 1.2-1.8 2.6M12 17h.01"/></>,
  announcements: <><path d="M3 11v2h3l7 5V6l-7 5z"/><path d="M16 8a5 5 0 0 1 0 8M18.5 5.5a9 9 0 0 1 0 13"/></>,
  analytics: <><path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/></>,
  token: <><circle cx="12" cy="12" r="9"/><path d="M8 9.5c0-1.4 1.5-2.5 4-2.5s4 1.1 4 2.5-1.5 2.5-4 2.5-4 1.1-4 2.5S9.5 17 12 17s4-1.1 4-2.5M12 5v14"/></>,
  account: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {glyphs[name]}
    </svg>
  );
}
