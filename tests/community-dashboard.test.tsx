import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityPieChart } from '../src/components/CommunityPieChart';
import { getCommunityPlatformStats } from '../src/services/community-dashboard';

afterEach(() => cleanup());

describe('community platform stats', () => {
  it('normalizes known users and verified General/VIP membership counts', async () => {
    const client = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          platforms: [
            {
              platform: 'TELEGRAM',
              known_users: 24,
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
