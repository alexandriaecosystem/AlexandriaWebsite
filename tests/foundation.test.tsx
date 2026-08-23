import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AdminGuard } from '../src/app/AdminGuard';
import { ConflictState, RetryableErrorState } from '../src/components/AsyncState';
import { readPublicFrontendConfig } from '../src/services/supabase';

describe('browser configuration boundary', () => {
  it('accepts public Supabase values', () => {
    expect(readPublicFrontendConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co/', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key' })).toEqual({ supabaseUrl: 'https://example.supabase.co', supabasePublishableKey: 'public-key' });
  });

  it('rejects privileged browser variables', () => {
    expect(() => readPublicFrontendConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-key', VITE_SUPABASE_SERVICE_ROLE_KEY: 'secret' })).toThrow(/Forbidden privileged/);
  });
});

describe('administrator authorization', () => {
  it('denies an authenticated non-admin even when the account is active', async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: { user_id: 'u', is_admin: false, is_active: true }, error: null }),
    };

    render(<MemoryRouter><AdminGuard client={client as never}>protected</AdminGuard></MemoryRouter>);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('allows an active administrator', async () => {
    const client = {
      auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }) },
      rpc: vi.fn().mockResolvedValue({ data: { user_id: 'u', is_admin: true, is_active: true }, error: null }),
    };

    render(<MemoryRouter><AdminGuard client={client as never}>protected</AdminGuard></MemoryRouter>);
    expect(await screen.findByText('protected')).toBeInTheDocument();
  });
});

it('exposes conflict and retry actions', () => {
  const reload = vi.fn();
  const retry = vi.fn();
  render(<><ConflictState onReload={reload} /><RetryableErrorState onRetry={retry} /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(reload).toHaveBeenCalledOnce();
  expect(retry).toHaveBeenCalledOnce();
});
