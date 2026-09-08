import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/components/Feedback';
import { KnowledgeBasePage } from '../src/pages/KnowledgeBasePage';
import type { KnowledgeDocumentSummary } from '../src/types/contracts';

const { listDocuments } = vi.hoisted(() => ({ listDocuments: vi.fn() }));
vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/admin', () => ({
  listKnowledgeDocuments: listDocuments,
  approveKnowledgeDocument: vi.fn(),
  createKnowledgeDocument: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
  requestKnowledgeDocumentReprocessing: vi.fn(),
}));

beforeEach(() => window.localStorage.removeItem('alexandria-admin-language'));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('document availability guidance', () => {
  it('only labels processed, approved documents with indexed content as available', async () => {
    const documents: KnowledgeDocumentSummary[] = [
      { conflictScanStatus: 'READY', conflictScannedVersion: 1, conflictScannedAt: null, conflictScanError: null, openConflictCount: 0, blockingConflictCount: 0, approvalBlocked: false, id: 'available', title: 'Published guide', category: 'PROJECT_OFFICIAL', language: 'en', version: 1, processingStatus: 'READY', isApproved: true, chunkCount: 5, processingError: null, approvedBy: 'admin', approvedAt: '2026-09-04T00:00:00Z', createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z' },
      { conflictScanStatus: 'READY', conflictScannedVersion: 1, conflictScannedAt: null, conflictScanError: null, openConflictCount: 0, blockingConflictCount: 0, approvalBlocked: false, id: 'review', title: 'Needs review', category: 'PROJECT_OFFICIAL', language: 'en', version: 1, processingStatus: 'READY', isApproved: false, chunkCount: 5, processingError: null, approvedBy: null, approvedAt: null, createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z' },
      { conflictScanStatus: 'READY', conflictScannedVersion: 1, conflictScannedAt: null, conflictScanError: null, openConflictCount: 0, blockingConflictCount: 0, approvalBlocked: false, id: 'empty', title: 'Empty source', category: 'PROJECT_OFFICIAL', language: 'en', version: 1, processingStatus: 'READY', isApproved: true, chunkCount: 0, processingError: null, approvedBy: 'admin', approvedAt: '2026-09-04T00:00:00Z', createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z' },
      { conflictScanStatus: 'READY', conflictScannedVersion: 1, conflictScannedAt: null, conflictScanError: null, openConflictCount: 0, blockingConflictCount: 0, approvalBlocked: false, id: 'failed', title: 'Failed source', category: 'PROJECT_OFFICIAL', language: 'en', version: 1, processingStatus: 'FAILED', isApproved: true, chunkCount: 5, processingError: 'Extraction failed', approvedBy: 'admin', approvedAt: '2026-09-04T00:00:00Z', createdAt: '2026-09-04T00:00:00Z', updatedAt: '2026-09-04T00:00:00Z' },
    ];
    listDocuments.mockResolvedValue({ total: 4, items: documents });
    render(<LanguageProvider><ToastProvider><KnowledgeBasePage /></ToastProvider></LanguageProvider>);
    await screen.findByRole('heading', { name: 'Published guide' });
    const card = (title: string) => within(screen.getByRole('heading', { name: title }).closest('article')!);
    expect(card('Published guide').getByText('Ready for answers')).toBeInTheDocument();
    expect(card('Needs review').getByText('Needs approval')).toBeInTheDocument();
    expect(card('Needs review').getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(card('Empty source').getByText('No indexed content')).toBeInTheDocument();
    expect(card('Failed source').getByText('Processing failed')).toBeInTheDocument();
    expect(card('Failed source').queryByText('Ready for answers')).not.toBeInTheDocument();
    expect(card('Failed source').queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});
