import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  listAdminUsers: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/users-admin', () => ({ listAdminUsers: mocks.listAdminUsers }));
vi.mock('../src/components/Feedback', () => ({ useToast: () => ({ notify: mocks.notify }) }));

import { UsersPage } from '../src/pages/UsersPage';

const users = [
  {
    id: 'user-1-abcdefgh', name: 'Abed', country: null, region: null, preferredLanguage: 'en', status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z', platforms: ['whatsapp'], messageCount: 35,
    lastMessageAt: '2026-09-02T17:57:23Z', latestMessageText: null, latestMessageDirection: null, latestMessagePlatform: 'whatsapp',
    hasUnread: false, applicationStatus: 'PENDING_REVIEW', finalScore: 53, recommendation: null,
  },
  {
    id: 'user-2-abcdefgh', name: 'Alexandria', country: null, region: null, preferredLanguage: 'en', status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-30T00:00:00Z', platforms: ['telegram'], messageCount: 68,
    lastMessageAt: '2026-08-30T10:50:02Z', latestMessageText: null, latestMessageDirection: null, latestMessagePlatform: 'telegram',
    hasUnread: false, applicationStatus: 'CANCELLED', finalScore: 26, recommendation: null,
  },
  {
    id: 'user-3-abcdefgh', name: 'Active User', country: null, region: null, preferredLanguage: 'en', status: 'ACTIVE',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-29T00:00:00Z', platforms: ['telegram'], messageCount: 2,
    lastMessageAt: '2026-08-29T08:21:43Z', latestMessageText: null, latestMessageDirection: null, latestMessagePlatform: 'telegram',
    hasUnread: false, applicationStatus: null, finalScore: null, recommendation: null,
  },
  {
    id: 'user-4-abcdefgh', name: 'Discord User', country: null, region: null, preferredLanguage: 'en', status: 'BLOCKED',
    createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-28T00:00:00Z', platforms: ['discord'], messageCount: 8,
    lastMessageAt: '2026-08-28T08:21:43Z', latestMessageText: null, latestMessageDirection: null, latestMessagePlatform: 'discord',
    hasUnread: false, applicationStatus: null, finalScore: 75, recommendation: null,
  },
];

beforeEach(() => {
  mocks.listAdminUsers.mockResolvedValue({ items: users, total: users.length });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <UsersPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe('users visual dashboard', () => {
  it('summarizes status and platform distribution from the loaded users', async () => {
    renderPage();

    expect(await screen.findByText('Total users')).toBeInTheDocument();
    expect(screen.getAllByText('Pending review').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    expect(screen.getByText('Users by platform')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /User status: 1 active, 1 pending review, 1 cancelled, 1 other/i })).toBeInTheDocument();
  });

  it('filters the table by effective user status', async () => {
    renderPage();
    expect(await screen.findByText('Abed')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'ACTIVE' } });

    await waitFor(() => expect(screen.queryByText('Abed')).not.toBeInTheDocument());
    expect(screen.getByText('Active User')).toBeInTheDocument();
    expect(screen.queryByText('Alexandria')).not.toBeInTheDocument();
  });
});
