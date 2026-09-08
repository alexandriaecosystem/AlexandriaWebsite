import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const activeWindow: AiSleepWindow = {
  ...scheduledWindow,
  id: '44444444-4444-4444-8444-444444444444',
  startsAt: '2026-09-05T14:00:00.000Z',
  endsAt: '2026-09-05T17:00:00.000Z',
  status: 'ACTIVE',
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
  it('shows explicit AI status and direct takeover actions with friendly community names', async () => {
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

    expect(await screen.findByText('AI Active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Take Over Now' }));

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

    fireEvent.click(await screen.findByRole('button', { name: 'Schedule Takeover' }));
    fireEvent.change(screen.getByLabelText('Community or conversation'), { target: { value: targets[0].communityId } });
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

  it('supports 30m, 1h, 2h, 4h, Until tomorrow and Custom immediate durations', async () => {
    const createWindow = vi.fn().mockResolvedValue(activeWindow);

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

    fireEvent.click(await screen.findByRole('button', { name: 'Take Over Now' }));
    expect(screen.getByRole('button', { name: '30 min' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 hour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2 hours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '4 hours' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Until tomorrow' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Custom' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Until tomorrow' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start takeover' }));
    await waitFor(() => expect(createWindow).toHaveBeenCalledTimes(1));
    const tomorrowCall = createWindow.mock.calls[0][0];
    const tomorrow = new Date(NOW);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    expect(tomorrowCall.endsAt).toBe(tomorrow.toISOString());

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('Custom return time'), { target: { value: '2026-09-06T11:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start takeover' }));
    await waitFor(() => expect(createWindow).toHaveBeenCalledTimes(2));
    expect(createWindow.mock.calls[1][0].endsAt).toBe(new Date('2026-09-06T11:30').toISOString());
  });

  it('separates Active Takeovers from Upcoming Takeovers and keeps Return to AI/Cancel explicit', async () => {
    render(
      <LanguageProvider>
        <TakeoverManager
          now={NOW}
          listTargets={vi.fn().mockResolvedValue(targets)}
          listWindows={vi.fn().mockResolvedValue({ items: [activeWindow, scheduledWindow], total: 2 })}
          createWindow={vi.fn()}
          cancelWindow={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(await screen.findByText('Human Takeover Active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Return to AI' }));

    const active = screen.getByRole('region', { name: 'Active Takeovers' });
    const upcoming = screen.getByRole('region', { name: 'Upcoming Takeovers' });
    expect(within(active).getByText('Telegram General Community')).toBeInTheDocument();
    expect(within(active).getByRole('button', { name: 'Return to AI' })).toBeInTheDocument();
    expect(within(upcoming).getByText('Telegram General Community')).toBeInTheDocument();
    expect(within(upcoming).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
