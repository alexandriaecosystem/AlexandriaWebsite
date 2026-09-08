import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  loadWhatsappQuizAdmin: vi.fn(),
  saveWhatsappQuizSchedule: vi.fn(),
  sendWhatsappQuizNow: vi.fn(),
  pauseWhatsappQuiz: vi.fn(),
  addWhatsappQuizQuestion: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/whatsapp-quiz', () => ({
  loadWhatsappQuizAdmin: mocks.loadWhatsappQuizAdmin,
  saveWhatsappQuizSchedule: mocks.saveWhatsappQuizSchedule,
  sendWhatsappQuizNow: mocks.sendWhatsappQuizNow,
  pauseWhatsappQuiz: mocks.pauseWhatsappQuiz,
  addWhatsappQuizQuestion: mocks.addWhatsappQuizQuestion,
}));

import { WhatsAppQuizPage } from '../src/pages/WhatsAppQuizPage';

const generalId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  mocks.loadWhatsappQuizAdmin.mockResolvedValue({
    targets: [{ communityId: generalId, name: 'WhatsApp General Community', communityLevel: 'GENERAL' }],
    questions: [],
    questionStats: { total: 100, active: 96, excluded: 4 },
    questionPreviewStatus: 'READY',
    schedule: {
      enabled: false,
      communityId: generalId,
      communityName: 'WhatsApp General Community',
      frequency: 'daily',
      timeOfDay: '19:00',
      timezone: 'Asia/Beirut',
      daysOfWeek: [],
      status: 'PAUSED',
      lastRunAt: null,
      nextRunAt: null,
      lastError: '',
    },
  });
  mocks.saveWhatsappQuizSchedule.mockResolvedValue(undefined);
  mocks.sendWhatsappQuizNow.mockResolvedValue(undefined);
  mocks.pauseWhatsappQuiz.mockResolvedValue(undefined);
  mocks.addWhatsappQuizQuestion.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WhatsApp quiz question editor', () => {
  it('lets an admin add one active four-option question without entering technical IDs', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);

    expect(await screen.findByRole('heading', { name: 'Add question' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Which network does this quiz use for transfers?' } });
    fireEvent.change(screen.getByLabelText('Option A'), { target: { value: 'TRON' } });
    fireEvent.change(screen.getByLabelText('Option B'), { target: { value: 'Ethereum' } });
    fireEvent.change(screen.getByLabelText('Option C'), { target: { value: 'Solana' } });
    fireEvent.change(screen.getByLabelText('Option D'), { target: { value: 'BNB Smart Chain' } });
    fireEvent.change(screen.getByLabelText('Correct answer'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to question bank' }));

    await waitFor(() => expect(mocks.addWhatsappQuizQuestion).toHaveBeenCalledWith(expect.anything(), {
      prompt: 'Which network does this quiz use for transfers?',
      options: ['TRON', 'Ethereum', 'Solana', 'BNB Smart Chain'],
      correctOptionIndex: 0,
    }));
    expect(screen.queryByText(/source question|question id|database/i)).not.toBeInTheDocument();
  });
});
