import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminGuard } from '../src/app/AdminGuard';
import { ConflictState, RetryableErrorState } from '../src/components/AsyncState';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import { LanguageToggle } from '../src/i18n/LanguageToggle';
import { readPublicFrontendConfig } from '../src/services/supabase';

afterEach(() => cleanup());

function authenticatedClient(admin: boolean, aal: { currentLevel: 'aal1' | 'aal2'; nextLevel: 'aal1' | 'aal2' } = { currentLevel: 'aal1', nextLevel: 'aal1' }) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null }),
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: aal, error: null }),
      },
    },
    rpc: vi.fn().mockResolvedValue({ data: { user_id: 'u', is_admin: admin, is_active: true }, error: null }),
  };
}

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
    const client = authenticatedClient(false);
    render(<MemoryRouter><AdminGuard client={client as never}>protected</AdminGuard></MemoryRouter>);
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('allows an active administrator', async () => {
    const client = authenticatedClient(true);
    render(<MemoryRouter><AdminGuard client={client as never}>protected</AdminGuard></MemoryRouter>);
    expect(await screen.findByText('protected')).toBeInTheDocument();
  });

  it('redirects an enrolled administrator to MFA before protected content', async () => {
    const client = authenticatedClient(true, { currentLevel: 'aal1', nextLevel: 'aal2' });
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/protected" element={<AdminGuard client={client as never}>protected</AdminGuard>} />
          <Route path="/login" element={<div>mfa login</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('mfa login')).toBeInTheDocument();
    expect(screen.queryByText('protected')).not.toBeInTheDocument();
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

it('switches between English and Arabic and persists RTL direction', () => {
  window.localStorage.removeItem('alexandria-admin-language');
  render(<LanguageProvider><LanguageToggle /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'العربية' }));
  expect(document.documentElement.lang).toBe('ar');
  expect(document.documentElement.dir).toBe('rtl');
  expect(window.localStorage.getItem('alexandria-admin-language')).toBe('ar');
  fireEvent.click(screen.getByRole('button', { name: 'EN' }));
  expect(document.documentElement.lang).toBe('en');
  expect(document.documentElement.dir).toBe('ltr');
  window.localStorage.removeItem('alexandria-admin-language');
});
