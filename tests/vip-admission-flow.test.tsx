import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { ToastProvider } from '../src/components/Feedback';

const q = Array.from({ length: 6 }, (_, index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`,
  number: index + 1,
  prompt: `Admission question ${index + 1}`,
}));

const mocks = vi.hoisted(() => ({
  loadWhatsappQuizAdmin: vi.fn(),
  saveWhatsappQuizSchedule: vi.fn(),
  saveAdmissionQuizSettings: vi.fn(),
  addWhatsappQuizQuestion: vi.fn(),
  listAdmissions: vi.fn(),
  getAdmissionDetail: vi.fn(),
  decideAdmission: vi.fn(),
  reissueAdmissionForm: vi.fn(),
  getIdentificationUrl: vi.fn(),
  getApplicationAudit: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/whatsapp-quiz', () => ({
  loadWhatsappQuizAdmin: mocks.loadWhatsappQuizAdmin,
  saveWhatsappQuizSchedule: mocks.saveWhatsappQuizSchedule,
  saveAdmissionQuizSettings: mocks.saveAdmissionQuizSettings,
  addWhatsappQuizQuestion: mocks.addWhatsappQuizQuestion,
}));
vi.mock('../src/services/admission', () => ({
  listAdmissions: mocks.listAdmissions,
  getAdmissionDetail: mocks.getAdmissionDetail,
  decideAdmission: mocks.decideAdmission,
  reissueAdmissionForm: mocks.reissueAdmissionForm,
  getIdentificationUrl: mocks.getIdentificationUrl,
}));
vi.mock('../src/services/admin', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/admin')>();
  return { ...original, getApplicationAudit: mocks.getApplicationAudit };
});

import { WhatsAppQuizPage } from '../src/pages/WhatsAppQuizPage';
import { ReviewsPage } from '../src/pages/ReviewsPage';
import { ReviewDetailPage } from '../src/pages/ReviewDetailPage';

const generalId = '11111111-1111-4111-8111-111111111111';
const approvedId = '22222222-2222-4222-8222-222222222222';
const announcementsId = '33333333-3333-4333-8333-333333333333';
const applicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function renderAdmin(element: React.ReactNode) {
  return render(<LanguageProvider><ToastProvider>{element}</ToastProvider></LanguageProvider>);
}

beforeEach(() => {
  mocks.loadWhatsappQuizAdmin.mockResolvedValue({
    targets: [
      { communityId: generalId, name: 'WhatsApp General Community', communityLevel: 'GENERAL' },
      { communityId: announcementsId, name: 'WhatsApp Announcements', communityLevel: 'GENERAL' },
      { communityId: approvedId, name: 'WhatsApp Approved Community', communityLevel: 'APPROVED' },
    ],
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
    questions: [],
    questionStats: { total: 100, active: 100, excluded: 0 },
    questionPreviewStatus: 'READY',
    admission: {
      greeting: 'Welcome to today’s Alexandria quiz.',
      questionIds: q.slice(0, 5).map((item) => item.id),
      formOrigin: null,
      updatedAt: '2026-09-10T21:19:41.000Z',
      questionBank: q,
    },
  });
  mocks.saveWhatsappQuizSchedule.mockResolvedValue(undefined);
  mocks.saveAdmissionQuizSettings.mockResolvedValue(undefined);
  mocks.addWhatsappQuizQuestion.mockResolvedValue(undefined);

  mocks.listAdmissions.mockResolvedValue([
    { applicationId: 'low', name: 'Low score participant', platform: 'whatsapp', stage: 'SCORE_REVIEW', quizScore: 20, personaScore: 25, totalScore: 21.5, version: 1, updatedAt: '2026-09-10T20:00:00Z' },
    { applicationId: 'waiting', name: 'Awaiting details', platform: 'whatsapp', stage: 'FORM_PENDING', quizScore: 95, personaScore: 90, totalScore: 93.5, version: 2, updatedAt: '2026-09-10T21:00:00Z' },
    { applicationId: 'info', name: 'Information review', platform: 'telegram', stage: 'INFORMATION_REVIEW', quizScore: 80, personaScore: 80, totalScore: 80, version: 3, updatedAt: '2026-09-10T22:00:00Z' },
  ]);

  mocks.getAdmissionDetail.mockResolvedValue({
    applicationId,
    platform: 'whatsapp',
    stage: 'SCORE_REVIEW',
    quizScore: 72,
    personaScore: 81,
    totalScore: 74.7,
    version: 4,
    updatedAt: '2026-09-10T22:00:00Z',
    information: null,
    personaEvidence: [{ rationale: 'Explains custody and liquidity risks clearly.' }],
    personaSummary: 'Shows practical crypto understanding.',
    history: [],
  });
  mocks.getApplicationAudit.mockResolvedValue({ application: {}, answers: [], categoryScores: [], evaluations: [], decisions: [], access: [] });
  mocks.decideAdmission.mockResolvedValue({ application_id: applicationId, stage: 'FORM_PENDING', access_queued: false });
  mocks.reissueAdmissionForm.mockResolvedValue({ queued: true });
  mocks.getIdentificationUrl.mockResolvedValue('https://signed.example.test/id');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('VIP admission administration', () => {
  it('uses five selected daily questions and does not expose legacy automatic qualification wording', async () => {
    renderAdmin(<WhatsAppQuizPage />);

    expect(await screen.findByText('5 questions per quiz')).toBeInTheDocument();
    expect(screen.getByText('5 selected')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp General Community' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'WhatsApp Approved Community' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'WhatsApp Announcements' })).not.toBeInTheDocument();
    expect(screen.getByText(/To be considered for VIP access, join our public community/)).toBeInTheDocument();
    expect(screen.queryByText(/10\/10|7\/10|automatic qualification|automatic private invite/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send .* now/i })).not.toBeInTheDocument();
  });

  it('saves selected questions and greeting without sending anything', async () => {
    renderAdmin(<WhatsAppQuizPage />);
    await screen.findByText('5 selected');

    fireEvent.click(screen.getByLabelText('Admission question 1'));
    fireEvent.click(screen.getByLabelText('Admission question 6'));
    fireEvent.change(screen.getByLabelText('Daily greeting'), { target: { value: 'Hello public community.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quiz content' }));

    await waitFor(() => expect(mocks.saveAdmissionQuizSettings).toHaveBeenCalledWith(expect.anything(), {
      greeting: 'Hello public community.',
      questionIds: [q[1].id, q[2].id, q[3].id, q[4].id, q[5].id],
      formOrigin: null,
    }));
  });

  it('shows every admission stage including low-scoring participants', async () => {
    renderAdmin(<MemoryRouter><ReviewsPage /></MemoryRouter>);

    expect(await screen.findByText('Low score participant')).toBeInTheDocument();
    expect(screen.getByText('Awaiting details')).toBeInTheDocument();
    expect(screen.getByText('Information review')).toBeInTheDocument();
    expect(screen.getByText('Assessment review')).toBeInTheDocument();
    expect(screen.getByText('Awaiting information')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Quiz' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Crypto understanding' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Combined' })).toBeInTheDocument();
  });

  it('keeps assessment approval separate from final private-access approval', async () => {
    renderAdmin(<MemoryRouter initialEntries={[`/reviews/${applicationId}`]}><Routes><Route path="/reviews/:applicationId" element={<ReviewDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByRole('button', { name: 'Request information' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Defer / decline' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve private access/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Decision rationale'), { target: { value: 'Assessment evidence reviewed.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Request information' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm request' }));

    await waitFor(() => expect(mocks.decideAdmission).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      applicationId,
      stage: 'SCORE_REVIEW',
      decision: 'APPROVE',
      version: 4,
    })));
  });

  it('shows submitted information only in the second review and retrieves ID through the protected signed-url flow', async () => {
    mocks.getAdmissionDetail.mockResolvedValueOnce({
      applicationId,
      platform: 'whatsapp',
      stage: 'INFORMATION_REVIEW',
      quizScore: 72,
      personaScore: 81,
      totalScore: 74.7,
      version: 5,
      updatedAt: '2026-09-10T22:30:00Z',
      information: {
        firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', country: 'Lebanon', phone: '+96170000000',
        xHandle: '@ada', telegramId: null, submittedAt: '2026-09-10T22:25:00Z', hasIdentification: true,
      },
      personaEvidence: [],
      personaSummary: 'Shows practical crypto understanding.',
      history: [],
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderAdmin(<MemoryRouter initialEntries={[`/reviews/${applicationId}`]}><Routes><Route path="/reviews/:applicationId" element={<ReviewDetailPage />} /></Routes></MemoryRouter>);

    expect(await screen.findByText('ada@example.test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View identification' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve private access' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request corrections' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View identification' }));
    await waitFor(() => expect(mocks.getIdentificationUrl).toHaveBeenCalledWith(expect.anything(), applicationId));
    expect(open).toHaveBeenCalledWith('https://signed.example.test/id', '_blank', 'noopener,noreferrer');
  });
});
