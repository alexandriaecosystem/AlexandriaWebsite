import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CommunityPieChart, PlatformUsersPieChart } from '../src/components/CommunityPieChart';

afterEach(() => cleanup());

describe('modern dashboard charts', () => {
  it('renders the community membership chart as an SVG data visualization', () => {
    const { container } = render(<CommunityPieChart label="Members" general={80} vip={20} />);
    expect(container.querySelector('.community-pie-visual svg')).toBeTruthy();
  });

  it('renders the platform distribution chart as an SVG data visualization', () => {
    const { container } = render(<PlatformUsersPieChart telegram={50} discord={30} whatsapp={20} />);
    expect(container.querySelector('.community-pie-visual svg')).toBeTruthy();
  });
});
