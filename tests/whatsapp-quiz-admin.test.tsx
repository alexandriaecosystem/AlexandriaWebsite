import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  loadWhatsappQuizAdmin: vi.fn(),
  saveWhatsappQuizSchedule: vi.fn(),
  saveAdmissionQuizSettings: vi.fn(),
  addWhatsappQuizQuestion: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/whatsapp-quiz', () => ({
  loadWhatsappQuizAdmin: mocks.loadWhatsappQuizAdmin,
  saveWhatsappQuizSchedule: mocks.saveWhatsappQuizSchedule,
  saveAdmissionQuizSettings: mocks.saveAdmissionQuizSettings,
  addWhatsappQuizQuestion: mocks.addWhatsappQuizQuestion,
}));

import { WhatsAppQuizPage } from '../src/pages/WhatsAppQuizPage';

const announcementsId = '00000000-0000-4000-8000-000000000000';
const generalId = '11111111-1111-4111-8111-111111111111';
const approvedId = '22222222-2222-4222-8222-222222222222';
const questions = Array.from({ length: 5 }, (_, index) => ({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
  number: index + 1,
  prompt: `Admission question ${index + 1}`,
}));

beforeEach(() => {
  mocks.loadWhatsappQuizAdmin.mockResolvedValue({
    targets: [
      { communityId: announcementsId, name: 'WhatsApp Announcements', communityLevel: 'GENERAL' },
      { communityId: generalId, name: 'WhatsApp General Community', communityLevel: 'GENERAL' },
      { communityId: approvedId, name: 'WhatsApp Approved Community', communityLevel: 'APPROVED' },
    ],
    questions: [
      { id: questions[0].id, sourceQuestionNo: 1, prompt: questions[0].prompt, options: ['A', 'B', 'C', 'D'], rewardCredits: 50 },
    ],
    questionStats: { total: 100, active: 96, excluded: 4 },
    questionPreviewStatus: 'READY',
    schedule: {
      enabled: true,
      communityId: generalId,
      communityName: 'WhatsApp General Community',
      frequency: 'daily',
      timeOfDay: '19:00',
      timezone: 'Asia/Beirut',
      daysOfWeek: [],
      status: 'READY',
      lastRunAt: '2026-09-10T16:00:00.000Z',
      nextRunAt: '2026-09-11T16:00:00.000Z',
      lastError: '',
    },
    admission: {
      greeting: 'Welcome to today’s Alexandria quiz.',
      questionIds: questions.map((item) => item.id),
      formOrigin: null,
      updatedAt: '2026-09-10T21:19:41.000Z',
      questionBank: questions,
    },
  });
  mocks.saveWhatsappQuizSchedule.mockResolvedValue(undefined);
  mocks.saveAdmissionQuizSettings.mockResolvedValue(undefined);
  mocks.addWhatsappQuizQuestion.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WhatsApp Quiz admin page', () => {
  it('uses the public General Community only and never exposes a manual send action', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);

    expect(await screen.findByText('5 questions per quiz')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp General Community' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'WhatsApp Approved Community' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'WhatsApp Announcements' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Community')).toHaveValue(generalId);
    expect(screen.queryByRole('button', { name: /send .* now/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Saving updates configuration only. It never sends a quiz immediately./)).toBeInTheDocument();
  });

  it('shows saved delivery status from the backend', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);

    expect(await screen.findByRole('heading', { name: 'WhatsApp General Community' })).toBeInTheDocument();
    expect(screen.getByText('READY')).toBeInTheDocument();
    expect(screen.getAllByText(/Sep 10|Sep 11|10\/09|11\/09|2026/).length).toBeGreaterThanOrEqual(2);
  });

  it('can save Daily at 7 PM, Weekly, and Custom days without sending', async () => {
    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);
    await screen.findByRole('heading', { name: 'Public community quiz' });

    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(mocks.saveWhatsappQuizSchedule).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      communityId: generalId,
      frequency: 'daily',
      timeOfDay: '19:00',
      timezone: 'Asia/Beirut',
      enabled: true,
    })));

    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'weekly' } });
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(mocks.saveWhatsappQuizSchedule).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ frequency: 'weekly', daysOfWeek: [5] })));

    fireEvent.change(screen.getByLabelText('Frequency'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByLabelText('Monday'));
    fireEvent.click(screen.getByLabelText('Wednesday'));
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    await waitFor(() => expect(mocks.saveWhatsappQuizSchedule).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ frequency: 'custom', daysOfWeek: expect.arrayContaining([1, 3]) })));
  });

  it('shows scheduler failures without exposing a send fallback', async () => {
    mocks.loadWhatsappQuizAdmin.mockResolvedValueOnce({
      targets: [{ communityId: generalId, name: 'WhatsApp General Community', communityLevel: 'GENERAL' }],
      questions: [],
      questionStats: null,
      questionPreviewStatus: 'ERROR',
      schedule: {
        enabled: false,
        communityId: generalId,
        communityName: 'WhatsApp General Community',
        frequency: 'daily',
        timeOfDay: '19:00',
        timezone: 'Asia/Beirut',
        daysOfWeek: [],
        status: 'ERROR',
        lastRunAt: null,
        nextRunAt: null,
        lastError: 'Quiz delivery failed.',
      },
      admission: {
        greeting: 'Hello',
        questionIds: questions.map((item) => item.id),
        formOrigin: null,
        updatedAt: null,
        questionBank: questions,
      },
    });

    render(<LanguageProvider><WhatsAppQuizPage /></LanguageProvider>);
    expect(await screen.findByText('The scheduler needs attention. Refresh its status before changing the schedule.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument();
  });
});
