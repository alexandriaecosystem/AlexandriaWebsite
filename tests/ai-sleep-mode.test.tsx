import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiSleepPanel } from '../src/components/AiSleepPanel';
import {
  classifyAiSleepWindow,
  createAiSleepWindow,
  listAiSleepWindows,
  localDateTimeToIso,
  validateSleepRange,
  type AiSleepWindow,
} from '../src/services/ai-sleep';
import { LanguageProvider } from '../src/i18n/LanguageContext';

const NOW = new Date('2026-08-28T12:00:00.000Z');

const activeWindow: AiSleepWindow = {
  id: '11111111-1111-4111-8111-111111111111',
  platform: 'TELEGRAM',
  externalChannelId: '-100123456',
  externalChannelName: 'VIP Community',
  startsAt: '2026-08-28T11:00:00.000Z',
  endsAt: '2026-08-28T14:00:00.000Z',
  reason: 'Human takeover',
  createdBy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  createdAt: '2026-08-28T10:55:00.000Z',
  cancelledAt: null,
  cancelledBy: null,
  status: 'ACTIVE',
};

const upcomingWindow: AiSleepWindow = {
  ...activeWindow,
  id: '22222222-2222-4222-8222-222222222222',
  platform: 'DISCORD',
  externalChannelId: '987654321',
  externalChannelName: 'VIP Lounge',
  startsAt: '2026-08-28T16:00:00.000Z',
  endsAt: '2026-08-28T18:00:00.000Z',
  status: 'UPCOMING',
};

afterEach(() => cleanup());

describe('AI sleep time semantics', () => {
  it('treats start as inclusive and end as exclusive', () => {
    expect(classifyAiSleepWindow(activeWindow, new Date('2026-08-28T11:00:00.000Z'))).toBe('ACTIVE');
    expect(classifyAiSleepWindow(activeWindow, new Date('2026-08-28T13:59:59.999Z'))).toBe('ACTIVE');
    expect(classifyAiSleepWindow(activeWindow, new Date('2026-08-28T14:00:00.000Z'))).toBe('ENDED');
  });

  it('gives cancellation precedence over time status', () => {
    expect(classifyAiSleepWindow({ ...activeWindow, cancelledAt: '2026-08-28T11:30:00.000Z' }, NOW)).toBe('CANCELLED');
  });

  it('serializes browser-local datetime values and validates a maximum 30-day window', () => {
    const start = '2026-08-28T18:00';
    const end = '2026-08-29T09:00';
    expect(localDateTimeToIso(start)).toBe(new Date(start).toISOString());
    expect(validateSleepRange(start, end)).toEqual({
      startsAt: new Date(start).toISOString(),
      endsAt: new Date(end).toISOString(),
    });
    expect(() => validateSleepRange(end, start)).toThrow('Sleep end time must be after the start time.');
    expect(() => validateSleepRange('2026-08-01T00:00', '2026-09-01T00:01')).toThrow('Sleep windows cannot be longer than 30 days.');
    expect(() => localDateTimeToIso('not-a-date')).toThrow('Invalid date or time.');
  });
});

describe('AI sleep Supabase service', () => {
  it('normalizes admin sleep-window RPC results', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          items: [{
            id: activeWindow.id,
            platform: 'TELEGRAM',
            external_channel_id: '-100123456',
            external_channel_name: 'VIP Community',
            starts_at: activeWindow.startsAt,
            ends_at: activeWindow.endsAt,
            reason: 'Human takeover',
            created_by: activeWindow.createdBy,
            created_at: activeWindow.createdAt,
            cancelled_at: null,
            cancelled_by: null,
            status: 'ACTIVE',
          }],
          total: 1,
        },
        error: null,
      }),
    };

    await expect(listAiSleepWindows(client as never, { platform: 'TELEGRAM', status: 'ACTIVE' })).resolves.toEqual({
      items: [activeWindow],
      total: 1,
    });
    expect(client.rpc).toHaveBeenCalledWith('admin_list_ai_sleep_windows', {
      p_platform: 'TELEGRAM',
      p_status: 'ACTIVE',
      p_limit: 100,
      p_offset: 0,
    });
  });

  it('sends normalized schedule arguments to the admin RPC', async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { id: activeWindow.id }, error: null }) };
    await createAiSleepWindow(client as never, {
      platform: 'TELEGRAM',
      externalChannelId: '-100123456',
      externalChannelName: 'VIP Community',
      startsAt: activeWindow.startsAt,
      endsAt: activeWindow.endsAt,
      reason: 'Human takeover',
    });
    expect(client.rpc).toHaveBeenCalledWith('admin_create_ai_sleep_window', {
      p_platform: 'TELEGRAM',
      p_external_channel_id: '-100123456',
      p_external_channel_name: 'VIP Community',
      p_starts_at: activeWindow.startsAt,
      p_ends_at: activeWindow.endsAt,
      p_reason: 'Human takeover',
    });
  });
});

describe('AI sleep operator panel', () => {
  it('shows an unmistakable human-takeover state and can wake an active channel', async () => {
    const listWindows = vi.fn().mockResolvedValue({ items: [activeWindow, upcomingWindow], total: 2 });
    const cancelWindow = vi.fn().mockResolvedValue(undefined);
    const onActiveCountChange = vi.fn();

    render(
      <LanguageProvider>
        <AiSleepPanel
          now={NOW}
          listWindows={listWindows}
          createWindow={vi.fn()}
          cancelWindow={cancelWindow}
          onActiveCountChange={onActiveCountChange}
        />
      </LanguageProvider>,
    );

    expect(await screen.findByText('AI Sleeping')).toBeInTheDocument();
    expect(screen.getByText('Human takeover active')).toBeInTheDocument();
    expect(screen.getByText('VIP Community')).toBeInTheDocument();
    expect(screen.getByText(/Wakes in 2h/)).toBeInTheDocument();
    expect(onActiveCountChange).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: 'Wake AI now for VIP Community' }));
    await waitFor(() => expect(cancelWindow).toHaveBeenCalledWith(activeWindow.id));
  });

  it('schedules a window from local datetime inputs and exposes upcoming/history views', async () => {
    const createWindow = vi.fn().mockResolvedValue(activeWindow);
    render(
      <LanguageProvider>
        <AiSleepPanel
          now={NOW}
          listWindows={vi.fn().mockResolvedValue({ items: [upcomingWindow], total: 1 })}
          createWindow={createWindow}
          cancelWindow={vi.fn()}
        />
      </LanguageProvider>,
    );

    await screen.findByText('AI sleep mode');
    fireEvent.change(screen.getByLabelText('Sleep platform'), { target: { value: 'TELEGRAM' } });
    fireEvent.change(screen.getByLabelText('Exact channel or group ID'), { target: { value: '-100123456' } });
    fireEvent.change(screen.getByLabelText('Channel or group name'), { target: { value: 'VIP Community' } });
    fireEvent.change(screen.getByLabelText('Sleep starts'), { target: { value: '2026-08-28T18:00' } });
    fireEvent.change(screen.getByLabelText('AI wakes'), { target: { value: '2026-08-29T09:00' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Admin coverage' } });
    expect(screen.getByText(/Duration:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule AI sleep' }));

    await waitFor(() => expect(createWindow).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'TELEGRAM',
      externalChannelId: '-100123456',
      externalChannelName: 'VIP Community',
      startsAt: new Date('2026-08-28T18:00').toISOString(),
      endsAt: new Date('2026-08-29T09:00').toISOString(),
      reason: 'Admin coverage',
    })));

    fireEvent.click(screen.getByRole('button', { name: 'Upcoming sleep windows' }));
    expect(screen.getByText('VIP Lounge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sleep history' })).toBeInTheDocument();
  });
});
