import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { loadWhatsappQuizAdmin } from '../src/services/whatsapp-quiz';

describe('WhatsApp Quiz scheduler resilience', () => {
  it('keeps the admin page data available when the scheduler status bridge is down', async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code' },
    });
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          community_id: 'announcements-id',
          platform: 'WHATSAPP',
          name: 'WhatsApp Announcements',
          community_level: 'GENERAL',
        },
        {
          community_id: 'general-id',
          platform: 'WHATSAPP',
          name: 'WhatsApp General Community',
          community_level: 'GENERAL',
        },
        {
          community_id: 'telegram-id',
          platform: 'TELEGRAM',
          name: 'Telegram General Community',
          community_level: 'GENERAL',
        },
      ],
      error: null,
    });
    const client = { functions: { invoke }, rpc } as unknown as SupabaseClient;

    const result = await loadWhatsappQuizAdmin(client);

    expect(invoke).toHaveBeenCalledWith('whatsapp-quiz-admin', { body: { action: 'STATUS' } });
    expect(rpc).toHaveBeenCalledWith('admin_list_takeover_targets');
    expect(result.targets.map((target) => target.name)).toEqual([
      'WhatsApp Announcements',
      'WhatsApp General Community',
    ]);
    expect(result.schedule).toEqual(expect.objectContaining({
      enabled: false,
      communityId: 'general-id',
      communityName: 'WhatsApp General Community',
      status: 'ERROR',
      nextRunAt: null,
    }));
    expect(result.schedule.lastError).toMatch(/scheduler connection needs attention/i);
  });

  it('still fails when admin target loading is also unavailable', async () => {
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: { message: 'scheduler unavailable' } }),
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'forbidden' } }),
    } as unknown as SupabaseClient;

    await expect(loadWhatsappQuizAdmin(client)).rejects.toThrow('scheduler unavailable');
  });
});
