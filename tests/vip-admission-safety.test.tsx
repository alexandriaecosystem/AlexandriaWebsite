import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../src/components/Feedback';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const mocks = vi.hoisted(() => ({
  getAdmissionDetail: vi.fn(),
  decideAdmission: vi.fn(),
  reissueAdmissionForm: vi.fn(),
  getIdentificationUrl: vi.fn(),
  getApplicationAudit: vi.fn(),
}));

vi.mock('../src/services/supabase', () => ({ getSupabaseClient: () => ({}) }));
vi.mock('../src/services/admission', () => ({
  getAdmissionDetail: mocks.getAdmissionDetail,
  decideAdmission: mocks.decideAdmission,
  reissueAdmissionForm: mocks.reissueAdmissionForm,
  getIdentificationUrl: mocks.getIdentificationUrl,
}));
vi.mock('../src/services/admin', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/services/admin')>();
  return { ...original, getApplicationAudit: mocks.getApplicationAudit };
});

import { ReviewDetailPage } from '../src/pages/ReviewDetailPage';

const applicationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeEach(() => {
  mocks.getAdmissionDetail.mockResolvedValue({
    applicationId,
    platform: 'whatsapp',
    stage: 'SCORE_REVIEW',
    quizScore: 92,
    personaScore: 88,
    totalScore: 90.8,
    version: 2,
    updatedAt: '2026-09-11T00:00:00Z',
    information: null,
    personaEvidence: [],
    personaSummary: 'Strong crypto discussion signals.',
    history: [],
    formOriginConfigured: false,
  });
  mocks.getApplicationAudit.mockResolvedValue({ application: {}, answers: [], categoryScores: [], evaluations: [], decisions: [], access: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VIP admission safety boundaries', () => {
  it('keeps request-information unavailable when the secure form origin is missing, even for a high score', async () => {
    render(
      <LanguageProvider><ToastProvider><MemoryRouter initialEntries={[`/reviews/${applicationId}`]}><Routes><Route path="/reviews/:applicationId" element={<ReviewDetailPage />} /></Routes></MemoryRouter></ToastProvider></LanguageProvider>,
    );

    const requestButton = await screen.findByRole('button', { name: 'Request information' });
    expect(requestButton).toBeDisabled();
    expect(screen.getByText(/admission_settings\.form_origin is not configured/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve private access' })).not.toBeInTheDocument();
  });

  it('does not compile public or private community invite URLs into the admission frontend', () => {
    const source = [
      'src/pages/WhatsAppQuizPage.tsx',
      'src/pages/ReviewsPage.tsx',
      'src/pages/ReviewDetailPage.tsx',
      'src/pages/CommunitiesPage.tsx',
      'src/services/whatsapp-quiz.ts',
      'src/services/admission.ts',
    ].map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(source).not.toMatch(/chat\.whatsapp\.com\//i);
    expect(source).not.toMatch(/t\.me\/\+/i);
    expect(source).not.toMatch(/discord\.gg\//i);
  });
});
