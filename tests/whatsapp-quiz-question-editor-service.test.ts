import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { addWhatsappQuizQuestion } from '../src/services/whatsapp-quiz';

describe('WhatsApp quiz question creation service', () => {
  it('sends only the question text, four options, and selected answer index to the protected admin function', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        targets: [],
        schedule: {
          enabled: false,
          community_id: null,
          community_name: null,
          frequency: 'daily',
          time_of_day: '19:00',
          timezone: 'Asia/Beirut',
          days_of_week: [],
          status: 'PAUSED',
          last_run_at: null,
          next_run_at: null,
          last_error: '',
        },
      },
      error: null,
    });
    const client = { functions: { invoke } } as unknown as SupabaseClient;

    await addWhatsappQuizQuestion(client, {
      prompt: 'Which network does this quiz use for transfers?',
      options: ['TRON', 'Ethereum', 'Solana', 'BNB Smart Chain'],
      correctOptionIndex: 0,
    });

    expect(invoke).toHaveBeenCalledWith('whatsapp-quiz-admin', {
      body: {
        action: 'ADD_QUESTION',
        prompt: 'Which network does this quiz use for transfers?',
        options: ['TRON', 'Ethereum', 'Solana', 'BNB Smart Chain'],
        correct_option_index: 0,
      },
    });
  });
});
