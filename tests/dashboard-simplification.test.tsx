import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  getDashboardMetrics: vi.fn(),
  listKnowledgeDocuments: vi.fn(),
  listKnowledgeGaps: vi.fn(),
  getCommunityPlatformStats: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/admin', () => ({
  getDashboardMetrics: mocks.getDashboardMetrics,
  listKnowledgeDocuments: mocks.listKnowledgeDocuments,
}));
vi.mock('../src/services/admin-operations', () => ({
  listKnowledgeGaps: mocks.listKnowledgeGaps,
  getMessageTimeseries: vi.fn().mockResolvedValue([{ bucketDate: '2026-08-29', messages: 8 }]),
}));
vi.mock('../src/services/community-dashboard', () => ({
  getCommunityPlatformStats: mocks.getCommunityPlatformStats,
}));

import { DashboardPage } from '../src/pages/DashboardPage';

const metrics = {
  totalUsers: 120,
  activeUsers: 94,
  approvedUsers: 36,
  pendingReviews: 4,
  blockedUsers: 2,
  totalMessages: 3200,
  messagesToday: 42,
  messagesLast7Days: 310,
  messagesLast30Days: 1300,
  aiResponses: 1100,
  cachedResponses: 500,
  cacheHitRate: 45,
  inputTokens: 12000,
  outputTokens: 6000,
  aiCostTotal: 18.42,
  aiCostToday: 0.8,
  aiCost7Days: 4.5,
  aiCost30Days: 16.2,
  failedOperations: 0,
};

beforeEach(() => {
  mocks.getDashboardMetrics.mockResolvedValue(metrics);
  mocks.listKnowledgeDocuments.mockResolvedValue({ total: 2 });
  mocks.listKnowledgeGaps.mockResolvedValue({ total: 3 });
  mocks.getCommunityPlatformStats.mockResolvedValue({
    platforms: [
      { platform: 'TELEGRAM', knownUsers: 60, generalMembers: 40, vipMembers: 20, verifiedMembers: 60, lastVerifiedAt: null, verificationConnected: true },
      { platform: 'DISCORD', knownUsers: 40, generalMembers: 30, vipMembers: 10, verifiedMembers: 40, lastVerifiedAt: null, verificationConnected: true },
      { platform: 'WHATSAPP', knownUsers: 20, generalMembers: 15, vipMembers: 5, verifiedMembers: 20, lastVerifiedAt: null, verificationConnected: true },
    ],
    overall: { knownUsers: 120, generalMembers: 85, vipMembers: 35, verifiedMembers: 120 },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('simplified dashboard', () => {
  it('shows only the essential KPI, platform distribution and attention layers', async () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <DashboardPage />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('120')).toBeInTheDocument();
    expect(container.querySelectorAll('.metric-card')).toHaveLength(3);
    expect(screen.getByText('Total users')).toBeInTheDocument();
    expect(screen.getByText('Active users')).toBeInTheDocument();
    expect(screen.getByText('Approved members')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Users by platform: Telegram 60/ })).toBeInTheDocument();
    expect(screen.getByText('Needs attention')).toBeInTheDocument();

    expect(screen.queryByText('AI spend')).not.toBeInTheDocument();
    expect(screen.queryByText('Messages trend')).not.toBeInTheDocument();
    expect(screen.queryByText('Quick actions')).not.toBeInTheDocument();
    expect(screen.queryByText('Verified group memberships')).not.toBeInTheDocument();
    expect(screen.queryByText('General')).not.toBeInTheDocument();
  });
});
