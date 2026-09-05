import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { TakeoverManager } from '../src/components/TakeoverManager';
import {
  createCommunityTakeover,
  listTakeoverTargets,
  type TakeoverTarget,
} from '../src/services/takeovers';
import type { AiSleepWindow } from '../src/services/ai-sleep';

const NOW = new Date('2026-09-05T15:00:00.000Z');

const targets: TakeoverTarget[] = [
  {
    communityId: '11111111-1111-4111-8111-111111111111',
    platform: 'TELEGRAM',
    name: 'Telegram General Community',
    communityLevel: 'GENERAL',
  },
  {
    communityId: '22222222-2222-4222-8222-222222222222',
    platform: 'WHATSAPP',
    name: 'WhatsApp Approved Community',
    communityLevel: 'APPROVED',
  },
];

const scheduledWindow: AiSleepWindow = {
  id: '33333333-3333-4333-8333-333333333333',
  platform: 'TELEGRAM',
  externalChannelId: '-1003992405181',
  externalChannelName: 'Telegram General Community',
  startsAt: '2026-09-05T15:30:00.000Z',
  endsAt: '2026-09-05T18:00:00.000Z',
  reason: 'Community event coverage',
  createdBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  createdAt: '2026-09-05T14:55:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
  status: 'UPCOMING',
};

afterEach(() => cleanup());

describe('takeover Supabase service', () => {
  it('loads friendly takeover targets without exposing platform target IDs', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            community_id: targets[0].communityId,
            platform: 'TELEGRAM',
            name: 'Telegram General Community',
            community_level: 'GENERAL',
          },
        ],
        error: null,
      }),
    };

    await expect(listTakeoverTargets(client as never)).resolves.toEqual([targets[0]]);
    expect(client.rpc).toHaveBeenCalledWith('admin_list_takeover_targets');
  });

  it('creates a takeover by community id instead of a raw group id', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { id: scheduledWindow.id }, error: null }) };

    await createCommunityTakeover(client as never, {
      communityId: targets[0].communityId,
      startsAt: scheduledWindow.startsAt,
      endsAt: scheduledWindow.endsAt,
      reason: scheduledWindow.reason,
    });

    expect(client.rpc).toHaveBeenCalledWith('admin_create_community_takeover', {
      p_community_id: targets[0].communityId,
      p_starts_at: scheduledWindow.startsAt,
      p_ends_at: scheduledWindow.endsAt,
      p_reason: scheduledWindow.reason,
    });
  });
});

describe('takeover manager UI', () => {
  it('uses friendly community names and never asks the admin for a channel id', async () => {
    render(
      <LanguageProvider>
        <TakeoverManager
          now={NOW}
          listTargets={vi.fn().mockResolvedValue(targets)}
          listWindows={vi.fn().mockResolvedValue({ items: [], total: 0 })}
          createWindow={vi.fn()}
          cancelWindow={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Manage takeovers' }));

    expect(screen.getByText('Take over AI replies')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Telegram General Community' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WhatsApp Approved Community' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/channel.*id/i)).not.toBeInTheDocument();
    expect(screen.queryByText('-1003992405181')).not.toBeInTheDocument();
  });

  it('schedules a takeover and explains that AI resumes automatically', async () => {
    const createWindow = vi.fn().mockResolvedValue(scheduledWindow);

    render(
      <LanguageProvider>
        <TakeoverManager
          now={NOW}
          listTargets={vi.fn().mockResolvedValue(targets)}
          listWindows={vi.fn().mockResolvedValue({ items: [scheduledWindow], total: 1 })}
          createWindow={createWindow}
          cancelWindow={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Manage takeovers' }));
    fireEvent.change(screen.getByLabelText('Community or conversation'), { target: { value: targets[0].communityId } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    fireEvent.change(screen.getByLabelText('Takeover starts'), { target: { value: '2026-09-05T18:30' } });
    fireEvent.change(screen.getByLabelText('AI resumes'), { target: { value: '2026-09-05T21:00' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Community event coverage' } });

    expect(screen.getByText(/incoming messages stay visible/i)).toBeInTheDocument();
    expect(screen.getByText(/automatically resume/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule takeover' }));

    await waitFor(() => expect(createWindow).toHaveBeenCalledWith({
      communityId: targets[0].communityId,
      startsAt: new Date('2026-09-05T18:30').toISOString(),
      endsAt: new Date('2026-09-05T21:00').toISOString(),
      reason: 'Community event coverage',
    }));
  });

  it('supports an immediate takeover with a quick duration', async () => {
    const createWindow = vi.fn().mockResolvedValue(scheduledWindow);

    render(
      <LanguageProvider>
        <TakeoverManager
          now={NOW}
          listTargets={vi.fn().mockResolvedValue(targets)}
          listWindows={vi.fn().mockResolvedValue({ items: [], total: 0 })}
          createWindow={createWindow}
          cancelWindow={vi.fn()}
        />
      </LanguageProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Manage takeovers' }));
    fireEvent.change(screen.getByLabelText('Community or conversation'), { target: { value: targets[1].communityId } });
    fireEvent.click(screen.getByRole('button', { name: 'Take over now' }));
    fireEvent.click(screen.getByRole('button', { name: '2 hours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start takeover' }));

    await waitFor(() => expect(createWindow).toHaveBeenCalledWith(expect.objectContaining({
      communityId: targets[1].communityId,
      startsAt: NOW.toISOString(),
      endsAt: new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString(),
    })));
  });
});
