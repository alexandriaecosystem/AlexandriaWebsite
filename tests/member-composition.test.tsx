import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { MemberCompositionChart } from '../src/components/MemberCompositionChart';
import { parseMemberComposition } from '../src/services/member-composition';
afterEach(cleanup);
const sample = { total_accounts: 11, linked_members: 9, segments: [
  { category: 'telegram_unknown', count: 6 }, { category: 'whatsapp', count: 5 },
] };
describe('truthful platform account composition', () => {
  it('keeps accounts separate from distinct members and never infers regular subscription', () => {
    render(<LanguageProvider><MemberCompositionChart data={parseMemberComposition(sample)} /></LanguageProvider>);
    expect(screen.getByRole('img', { name: /11 platform accounts/ })).toHaveAttribute('aria-label', expect.stringContaining('Telegram · status unknown: 6'));
    expect(screen.getByText(/9 linked members/)).toBeInTheDocument();
    expect(screen.queryByText('Telegram regular')).not.toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp Premium/)).not.toBeInTheDocument();
  });
  it('rejects invalid totals rather than drawing a misleading part-to-whole chart', () => {
    expect(() => parseMemberComposition({ ...sample, total_accounts: 12 })).toThrow();
    expect(() => parseMemberComposition({ ...sample, segments: [{ category: 'whatsapp', count: -1 }] })).toThrow();
    expect(() => parseMemberComposition({ ...sample, linked_members: 20 })).toThrow();
    expect(() => parseMemberComposition({ ...sample, total_accounts: 10, segments: [{ category: 'whatsapp', count: 5 }, { category: 'whatsapp', count: 5 }] })).toThrow();
  });
  it('shows a genuine empty state for zero accounts', () => {
    render(<LanguageProvider><MemberCompositionChart data={parseMemberComposition({ total_accounts: 0, linked_members: 0, segments: [] })} /></LanguageProvider>);
    expect(screen.getByText('No platform accounts recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
