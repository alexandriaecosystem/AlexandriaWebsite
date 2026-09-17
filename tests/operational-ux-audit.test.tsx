import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/components/Feedback';
import { PlatformUsersPieChart } from '../src/components/CommunityPieChart';
import { TakeoverManager } from '../src/components/TakeoverManager';

const mocks = vi.hoisted(() => ({ metrics: vi.fn(), gaps: vi.fn(), attention: vi.fn(), windows: vi.fn(), documents: vi.fn() }));
vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/admin', () => ({
  getDashboardMetrics: mocks.metrics, listKnowledgeDocuments: mocks.documents,
  approveKnowledgeDocument: vi.fn(), createKnowledgeDocument: vi.fn(), deleteKnowledgeDocument: vi.fn(), requestKnowledgeDocumentReprocessing: vi.fn(),
  listKnowledgeConflicts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
}));
vi.mock('../src/services/admin-operations', () => ({ listKnowledgeGaps: mocks.gaps }));
vi.mock('../src/services/dashboard-attention', () => ({ getDashboardAttention: mocks.attention }));
vi.mock('../src/services/ai-sleep', async (original) => ({ ...await original<typeof import('../src/services/ai-sleep')>(), listAiSleepWindows: mocks.windows }));
vi.mock('../src/components/AdminAgentPanel', () => ({ AdminAgentPanel: () => null }));
import { AppShell } from '../src/app/AppShell';
import { DashboardPage } from '../src/pages/DashboardPage';
import { KnowledgeBasePage } from '../src/pages/KnowledgeBasePage';

function view(content: React.ReactNode) {
  return render(<MemoryRouter><LanguageProvider><ToastProvider>{content}</ToastProvider></LanguageProvider></MemoryRouter>);
}
beforeEach(() => {
  window.localStorage.removeItem('alexandria-admin-language');
  mocks.metrics.mockResolvedValue({ totalUsers: 11, activeUsers: 11, activeUsers7Days: 0, pendingReviews: 0 });
  mocks.gaps.mockResolvedValue({ total: 0 });
  mocks.attention.mockResolvedValue({ knowledgeConflicts: 0, failedAnnouncements: 0 });
  mocks.windows.mockResolvedValue({ items: [], total: 0 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('operational truth and navigation', () => {
  it('places the knowledge library, gaps and announcements directly after Dashboard', () => {
    view(<AppShell />);
    const links = within(screen.getByRole('navigation', { name: 'Main menu' })).getAllByRole('link');
    expect(links.slice(0, 4).map((link) => link.textContent)).toEqual(['Dashboard', 'Knowledge Base', 'Knowledge Gaps', 'Announcements']);
    expect(links.map((link) => link.getAttribute('href'))).toContain('/whatsapp-quiz');
    expect(links.map((link) => link.getAttribute('href'))).toContain('/community');
  });
  it('does not turn a failed dashboard check into an all-clear claim', async () => {
    mocks.gaps.mockRejectedValue(new Error('offline'));
    view(<DashboardPage />);
    await screen.findByText('Total Members');
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(await screen.findByText('Some checks are unavailable')).toBeInTheDocument();
    const card = screen.getByRole('link', { name: /Knowledge Gaps/ });
    expect(within(card).getByText('—')).toBeInTheDocument();
  });
  it('does not plot missing activity data as zero active members', async () => {
    mocks.metrics.mockResolvedValue({ totalUsers: 11, activeUsers: 11, activeUsers7Days: null, pendingReviews: 0 });
    view(<DashboardPage />);
    await screen.findByText('Total Members');
    expect(screen.queryByRole('img', { name: /Members: 0 Active/ })).not.toBeInTheDocument();
    expect(screen.getByText('Activity data is unavailable')).toBeInTheDocument();
  });
  it('keeps never-observed Telegram subscription status unknown', () => {
    view(<PlatformUsersPieChart telegram={6} telegramPremium={0} discord={0} whatsapp={5} />);
    expect(screen.queryByText('6 Telegram Regular')).not.toBeInTheDocument();
    expect(screen.getByText('6 Telegram · status unknown')).toBeInTheDocument();
  });
  it('does not show AI Active before takeover status has loaded', () => {
    view(<TakeoverManager listTargets={() => new Promise(() => {})} listWindows={() => new Promise(() => {})} />);
    expect(screen.queryByText('AI Active')).not.toBeInTheDocument();
    expect(screen.getByText('Checking reply status…')).toBeInTheDocument();
  });
  it('shows failed takeover checks outside the unopened drawer without backend details', async () => {
    view(<TakeoverManager listTargets={async () => { throw new Error('secret webhook URL'); }} listWindows={async () => ({ items: [], total: 0 })} />);
    expect(await screen.findByText('Reply status unavailable')).toBeInTheDocument();
    expect(screen.queryByText('AI Active')).not.toBeInTheDocument();
    expect(screen.queryByText(/secret webhook URL/)).not.toBeInTheDocument();
  });
  it('does not call conflicted approved content available and blocks unsafe approval', async () => {
    const doc = { id: 'conflict', title: 'Conflicted source', category: 'PROJECT_OFFICIAL', language: 'en', version: 3,
      processingStatus: 'READY', isApproved: true, chunkCount: 5, processingError: null, approvedBy: 'admin', approvedAt: null,
      createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z', conflictScanStatus: 'READY',
      conflictScannedVersion: 3, conflictScannedAt: null, conflictScanError: null, openConflictCount: 1, blockingConflictCount: 1, approvalBlocked: true };
    mocks.documents.mockResolvedValue({ total: 2, items: [doc, { ...doc, id: 'unapproved', title: 'Blocked draft', isApproved: false }] });
    view(<KnowledgeBasePage />);
    await screen.findByRole('heading', { name: 'Conflicted source' });
    const published = within(screen.getByRole('heading', { name: 'Conflicted source' }).closest('article')!);
    expect(published.queryByText('In use')).not.toBeInTheDocument();
    expect(published.getByText('Conflict recorded')).toBeInTheDocument();
    // The unapproved draft lives in the Inactive box; there is no blind Approve
    // any more — activation must go through the content test dialog.
    const draft = within(screen.getByRole('heading', { name: 'Blocked draft' }).closest('article')!);
    expect(draft.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(draft.getByText('Conflict found')).toBeInTheDocument();
    expect(draft.getByRole('button', { name: 'Content test' })).toBeEnabled();
  });
});
