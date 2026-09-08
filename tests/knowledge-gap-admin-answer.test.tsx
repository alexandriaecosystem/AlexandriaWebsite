import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  listKnowledgeGaps: vi.fn(),
  ignoreKnowledgeGap: vi.fn(),
  answerKnowledgeGap: vi.fn(),
  reopenKnowledgeGap: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/knowledge-gaps', () => ({
  listKnowledgeGaps: mocks.listKnowledgeGaps,
  ignoreKnowledgeGap: mocks.ignoreKnowledgeGap,
  answerKnowledgeGap: mocks.answerKnowledgeGap,
  reopenKnowledgeGap: mocks.reopenKnowledgeGap,
}));

import { KnowledgeGapsPage } from '../src/pages/KnowledgeGapsPage';

const openGap = {
  id: 'gap-1', question: 'What is the official redemption window?', platform: 'whatsapp', language: 'en', occurrenceCount: 4,
  firstSeenAt: '2026-09-01T10:00:00Z', lastSeenAt: '2026-09-08T10:00:00Z', status: 'OPEN', resolvedDocumentId: null,
  adminAnswer: null, answeredAt: null,
};

beforeEach(() => {
  mocks.listKnowledgeGaps.mockResolvedValue({ total: 1, items: [openGap] });
  mocks.ignoreKnowledgeGap.mockResolvedValue({ id: 'gap-1', status: 'IGNORED' });
  mocks.answerKnowledgeGap.mockResolvedValue({ gap_id: 'gap-1', status: 'RESOLVED', resolved_document_id: 'doc-1' });
  mocks.reopenKnowledgeGap.mockResolvedValue({ gap_id: 'gap-1', status: 'OPEN', resolved_document_id: 'doc-1' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderPage() {
  return render(<MemoryRouter><LanguageProvider><KnowledgeGapsPage /></LanguageProvider></MemoryRouter>);
}

describe('knowledge gap admin answers', () => {
  it('distinguishes an answer still processing from a resolved gap', async () => {
    mocks.listKnowledgeGaps.mockResolvedValueOnce({ total: 1, items: [{ ...openGap, adminAnswer: 'Draft answer', answerProcessingStatus: 'PROCESSING' }] });
    renderPage();
    expect(await screen.findByText('Processing')).toBeInTheDocument();
    expect(screen.getByText(/approved before the assistant uses them/)).toBeInTheDocument();
  });

  it('lets an admin enter and save the trusted answer instead of blindly resolving the gap', async () => {
    renderPage();
    expect(await screen.findByText(openGap.question)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add answer' }));
    const editor = screen.getByRole('textbox', { name: 'Trusted answer' });
    fireEvent.change(editor, { target: { value: 'Redemptions follow the published policy and eligibility conditions.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save answer' }));
    await waitFor(() => expect(mocks.answerKnowledgeGap).toHaveBeenCalledWith(expect.anything(), 'gap-1', 'Redemptions follow the published policy and eligibility conditions.'));
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });

  it('keeps Ignore available for unanswered gaps', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: 'Ignore' })).toBeInTheDocument();
  });

  it('shows Edit answer and safely reopens an answered resolved gap', async () => {
    mocks.listKnowledgeGaps.mockResolvedValue({ total: 1, items: [{ ...openGap, status: 'RESOLVED', resolvedDocumentId: 'doc-1', adminAnswer: 'Existing trusted answer', answeredAt: '2026-09-08T11:00:00Z' }] });
    renderPage();
    expect(await screen.findByText('Existing trusted answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit answer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await waitFor(() => expect(mocks.reopenKnowledgeGap).toHaveBeenCalledWith(expect.anything(), 'gap-1'));
  });
});
