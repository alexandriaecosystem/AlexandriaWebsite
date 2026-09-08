import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  getDashboardMetrics: vi.fn(),
  listKnowledgeGaps: vi.fn(),
  getDashboardAttention: vi.fn(),
  listAiSleepWindows: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/admin', () => ({ getDashboardMetrics: mocks.getDashboardMetrics }));
vi.mock('../src/services/admin-operations', () => ({ listKnowledgeGaps: mocks.listKnowledgeGaps }));
vi.mock('../src/services/dashboard-attention', () => ({ getDashboardAttention: mocks.getDashboardAttention }));
vi.mock('../src/services/ai-sleep', () => ({
  listAiSleepWindows: mocks.listAiSleepWindows,
  classifyAiSleepWindow: vi.fn(() => 'ENDED'),
}));

import { DashboardPage } from '../src/pages/DashboardPage';

const metrics = {
  totalUsers: 120,
  activeUsers: 94,
  activeUsers7Days: 31,
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
  failedOperations: 2,
};

beforeEach(() => {
  mocks.getDashboardMetrics.mockResolvedValue(metrics);
  mocks.listKnowledgeGaps.mockResolvedValue({ total: 3 });
  mocks.getDashboardAttention.mockResolvedValue({ knowledgeConflicts: 2, failedAnnouncements: 1 });
  mocks.listAiSleepWindows.mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('simplified dashboard', () => {
  it('shows exactly the four essential summary cards and truthful seven-day activity', async () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <DashboardPage />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Pending Reviews')).toBeInTheDocument();
    expect(container.querySelectorAll('.metric-card')).toHaveLength(4);
    const summary = screen.getByRole('region', { name: 'Community summary' });
    expect(within(summary).getByText('Total Members')).toBeInTheDocument();
    expect(within(summary).getByText('Active Members')).toBeInTheDocument();
    expect(within(summary).getByText('Pending Reviews')).toBeInTheDocument();
    expect(within(summary).getByText('Knowledge Gaps')).toBeInTheDocument();

    expect(screen.getByText('Active vs inactive members')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Members: 31 Active \(25\.8%\), 89 Inactive \(74\.2%\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Active means a member has at least one processed message in the last 7 days/)).toBeInTheDocument();
    expect(screen.getByText('31 of 120 members were active in the last 7 days.')).toBeInTheDocument();
  });

  it('shows only admin-action alerts instead of secondary technical analytics', async () => {
    const { container } = render(
      <MemoryRouter>
        <LanguageProvider>
          <DashboardPage />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('Pending member reviews')).toBeInTheDocument();
    expect(screen.getByText('Knowledge conflicts')).toBeInTheDocument();
    expect(screen.getByText('Knowledge gaps')).toBeInTheDocument();
    expect(screen.getByText('Failed announcements')).toBeInTheDocument();

    expect(screen.queryByText('Failed operations')).not.toBeInTheDocument();
    expect(screen.queryByText('Users by platform')).not.toBeInTheDocument();
    expect(screen.queryByText('AI spend')).not.toBeInTheDocument();
    expect(screen.queryByText('Messages trend')).not.toBeInTheDocument();
    expect(container.querySelector('.platform-comparison')).not.toBeInTheDocument();
  });
});
