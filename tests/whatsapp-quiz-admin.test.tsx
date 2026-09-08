import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  loadWhatsappQuizAdmin: vi.fn(),
  saveWhatsappQuizSchedule: vi.fn(),
  sendWhatsappQuizNow: vi.fn(),
  pauseWhatsappQuiz: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/whatsapp-quiz', () => ({
  loadWhatsappQuizAdmin: mocks.loadWhatsappQuizAdmin,
  saveWhatsappQuizSchedule: mocks.saveWhatsappQuizSchedule,
  sendWhatsappQuizNow: mocks.sendWhatsappQuizNow,
  pauseWhatsappQuiz: mocks.pauseWhatsappQuiz,
}));

import { WhatsAppQuizPage } from '../src/pages/WhatsAppQuizPage';

const announcementsId = '00000000-0000-4000-8000-000000000000';
const generalId = '11111111-1111-4111-8111-111111111111';
const approvedId = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  mocks.loadWhatsappQuizAdmin.mockResolvedValue({
    targets: [
      { communityId: announcementsId, name: 'WhatsApp Announcements', communityLevel: 'GENERAL' },
      { communityId: generalId, name: 'WhatsApp General Community', communityLevel: 'GENERAL' },
      { communityId: approvedId, name: 'WhatsApp Approved Community', communityLevel: 'APPROVED' },
    ],
    schedule: {
      enabled: true,
      communityId: null,
      communityName: null,
      frequency: 'daily',
      timeOfDay: '19:00',
      timezone: 'Asia/Beirut',
      daysOfWeek: [],
      status: 'READY',
      lastRunAt: '2026-09-08T16:00:00.000Z',
      nextRunAt: '2026-09-09T16:00:00.000Z',
      lastError: '',
    },
  });
  mocks.saveWhatsappQuizSchedule.mockResolvedValue(undefined);
  mocks.sendWhatsappQuizNow.mockResolvedValue(undefined);
  mocks.pauseWhatsappQuiz.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WhatsApp Quiz admin page', () => {
  it('shows a nontechnical fixed-10 schedule and defaults to the real General Community', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);

    expect(await screen.findByText('10 questions per quiz')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp General Community' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp Approved Community' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp Announcements' })).toBeInTheDocument();
    expect(screen.getByLabelText('Community')).toHaveValue(generalId);
    expect(screen.getByText('Asia/Beirut')).toBeInTheDocument();
    expect(screen.queryByText(/120363|@g\.us|webhook|cron|n8n|secret/i)).not.toBeInTheDocument();
  });

  it('can save Daily at 7 PM, Weekly, and Custom days', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);
    await screen.findByRole('heading', { name: 'WhatsApp Quiz' });

    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(mocks.saveWhatsappQuizSchedule).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      communityId: generalId,
      frequency: 'daily',
      timeOfDay: '19:00',
      timezone: 'Asia/Beirut',
      enabled: true,
    })));

    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'weekly' } });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(mocks.saveWhatsappQuizSchedule).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      frequency: 'weekly',
      daysOfWeek: [5],
    })));

    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Wednesday'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(mocks.saveWhatsappQuizSchedule).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      frequency: 'custom',
      daysOfWeek: expect.arrayContaining([1, 3]),
    })));
  });

  it('supports pause and Send 10 Questions Now without exposing transport details', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);
    await screen.findByRole('heading', { name: 'WhatsApp Quiz' });

    fireEvent.click(screen.getByRole('button', { name: 'Send 10 Questions Now' }));
    await waitFor(() => expect(mocks.sendWhatsappQuizNow).toHaveBeenCalledWith(expect.anything(), generalId));

    fireEvent.click(screen.getByRole('button', { name: 'Pause Automatic Quiz' }));
    await waitFor(() => expect(mocks.pauseWhatsappQuiz).toHaveBeenCalledWith(expect.anything()));
  });

  it('shows a friendly failure state instead of a stack trace', async () => {
    mocks.loadWhatsappQuizAdmin.mockResolvedValueOnce({
      targets: [{ communityId: generalId, name: 'WhatsApp General Community', communityLevel: 'GENERAL' }],
      schedule: {
        enabled: true,
        communityId: generalId,
        communityName: 'WhatsApp General Community',
        frequency: 'daily',
        timeOfDay: '19:00',
        timezone: 'Asia/Beirut',
        daysOfWeek: [],
        status: 'ERROR',
        lastRunAt: null,
        nextRunAt: '2026-09-09T16:00:00.000Z',
        lastError: 'Quiz delivery failed. Please check the connection and try again.',
      },
    });

    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);
    expect(await screen.findByText('Quiz delivery failed. Please check the connection and try again.')).toBeInTheDocument();
  });
});
