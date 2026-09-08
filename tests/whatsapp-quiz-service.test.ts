import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadWhatsappQuizAdmin } from '../src/services/whatsapp-quiz';

function baseStatus() {
  return {
    targets: [{ community_id: '11111111-1111-4111-8111-111111111111', name: 'WhatsApp General Community', community_level: 'GENERAL' }],
    schedule: {
      enabled: false,
      community_id: '11111111-1111-4111-8111-111111111111',
      community_name: 'WhatsApp General Community',
      frequency: 'daily',
      time_of_day: '19:00',
      timezone: 'Asia/Beirut',
      days_of_week: [],
      status: 'PAUSED',
      last_run_at: null,
      next_run_at: null,
      last_error: '',
    },
  };
}

describe('WhatsApp quiz admin service', () => {
  it('loads the protected question preview independently from scheduler status', async () => {
    const rpc = vi.fn().mockImplementation((name: string) => {
      if (name !== 'admin_get_whatsapp_quiz_preview') throw new Error(`Unexpected RPC ${name}`);
      return Promise.resolve({
        data: {
          question_preview_status: 'READY',
          question_stats: { total: 100, active: 96, excluded: 4 },
          questions: [{
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            source_question_no: 1,
            prompt: 'What blockchain network is the Alexandria token built on?',
            options: ['TRON', 'Ethereum', 'Solana', 'BNB Smart Chain'],
            reward_credits: 50,
            correct_answer: 'TRON',
          }],
        },
        error: null,
      });
    });
    const client = {
      functions: { invoke: vi.fn().mockResolvedValue({ data: baseStatus(), error: null }) },
      rpc,
    } as unknown as SupabaseClient;

    const result = await loadWhatsappQuizAdmin(client);

    expect(rpc).toHaveBeenCalledWith('admin_get_whatsapp_quiz_preview', { p_limit: 10 });
    expect(result.questionStats).toEqual({ total: 100, active: 96, excluded: 4 });
    expect(result.questionPreviewStatus).toBe('READY');
    expect(result.questions).toEqual([{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      sourceQuestionNo: 1,
      prompt: 'What blockchain network is the Alexandria token built on?',
      options: ['TRON', 'Ethereum', 'Solana', 'BNB Smart Chain'],
      rewardCredits: 50,
    }]);
    expect(result.questions[0]).not.toHaveProperty('correct_answer');
  });

  it('keeps scheduler settings visible when the preview RPC is unavailable', async () => {
    const client = {
      functions: { invoke: vi.fn().mockResolvedValue({ data: baseStatus(), error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'unavailable' } }),
    } as unknown as SupabaseClient;

    const result = await loadWhatsappQuizAdmin(client);

    expect(result.schedule.status).toBe('PAUSED');
    expect(result.questions).toEqual([]);
    expect(result.questionStats).toBeNull();
    expect(result.questionPreviewStatus).toBe('ERROR');
  });
});
