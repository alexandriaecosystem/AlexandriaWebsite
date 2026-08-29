import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityPieChart, PlatformUsersPieChart } from '../src/components/CommunityPieChart';
import { getCommunityPlatformStats } from '../src/services/community-dashboard';

afterEach(() => cleanup());

describe('community platform stats', () => {
  it('normalizes known users, Telegram Premium users and verified General/VIP membership counts', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          platforms: [
            {
              platform: 'TELEGRAM',
              known_users: 24,
              premium_users: 6,
              general_members: 18,
              vip_members: 6,
              verified_members: 24,
              last_verified_at: '2026-08-28T08:00:00Z',
              verification_connected: true,
            },
          ],
          overall: { known_users: 24, general_members: 18, vip_members: 6, verified_members: 24 },
        },
        error: null,
      }),
    };

    await expect(getCommunityPlatformStats(client as never)).resolves.toEqual({
      platforms: [
        {
          platform: 'TELEGRAM',
          knownUsers: 24,
          premiumUsers: 6,
          generalMembers: 18,
          vipMembers: 6,
          verifiedMembers: 24,
          lastVerifiedAt: '2026-08-28T08:00:00Z',
          verificationConnected: true,
        },
      ],
      overall: { knownUsers: 24, generalMembers: 18, vipMembers: 6, verifiedMembers: 24 },
    });
    expect(client.rpc).toHaveBeenCalledWith('admin_get_community_platform_stats');
  });

  it('falls back to the existing admin user list when the platform-stats RPC is unavailable', async () => {
    const client = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: null, error: { message: 'Could not find the function public.admin_get_community_platform_stats' } })
        .mockResolvedValueOnce({
          data: {
            total: 3,
            items: [
              { id: 'user-1', platforms: ['TELEGRAM'] },
              { id: 'user-2', platforms: ['TELEGRAM', 'WHATSAPP'] },
              { id: 'user-3', platforms: ['DISCORD'] },
            ],
          },
          error: null,
        }),
    };

    await expect(getCommunityPlatformStats(client as never)).resolves.toEqual({
      platforms: [
        {
          platform: 'TELEGRAM',
          knownUsers: 2,
          premiumUsers: 0,
          generalMembers: 0,
          vipMembers: 0,
          verifiedMembers: 0,
          lastVerifiedAt: null,
          verificationConnected: false,
        },
        {
          platform: 'DISCORD',
          knownUsers: 1,
          premiumUsers: 0,
          generalMembers: 0,
          vipMembers: 0,
          verifiedMembers: 0,
          lastVerifiedAt: null,
          verificationConnected: false,
        },
        {
          platform: 'WHATSAPP',
          knownUsers: 1,
          premiumUsers: 0,
          generalMembers: 0,
          vipMembers: 0,
          verifiedMembers: 0,
          lastVerifiedAt: null,
          verificationConnected: false,
        },
      ],
      overall: { knownUsers: 3, generalMembers: 0, vipMembers: 0, verifiedMembers: 0 },
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'admin_get_community_platform_stats');
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'admin_list_users', {
      p_limit: 200,
      p_offset: 0,
      p_search: null,
    });
  });
});

describe('CommunityPieChart', () => {
  it('renders exact values and visible General/VIP percentages with an accessible text equivalent', () => {
    render(<CommunityPieChart label="Telegram" general={18} vip={6} />);
    expect(screen.getByRole('img', { name: 'Telegram: 18 General (75%), 6 VIP (25%)' })).toBeInTheDocument();
    expect(screen.getByText('18 General')).toBeInTheDocument();
    expect(screen.getByText('6 VIP')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  it('handles an empty membership total without invalid chart math', () => {
    render(<CommunityPieChart label="WhatsApp" general={0} vip={0} />);
    expect(screen.getByRole('img', { name: 'WhatsApp: 0 General (0%), 0 VIP (0%)' })).toHaveAttribute('data-vip-percent', '0');
  });
});

describe('PlatformUsersPieChart', () => {
  it('splits Telegram into Premium and Regular while preserving the platform total', () => {
    render(<PlatformUsersPieChart telegram={24} telegramPremium={6} discord={12} whatsapp={4} />);

    expect(
      screen.getByRole('img', {
        name: 'Users by platform: Telegram Premium 6 (15%), Telegram Regular 18 (45%), Discord 12 (30%), WhatsApp 4 (10%)',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('6 Telegram Premium')).toBeInTheDocument();
    expect(screen.getByText('18 Telegram Regular')).toBeInTheDocument();
    expect(screen.getByText('12 Discord')).toBeInTheDocument();
    expect(screen.getByText('4 WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });
});
