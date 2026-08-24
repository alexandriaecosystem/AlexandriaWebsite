import { useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Navigate, Outlet } from 'react-router-dom';
import { getSupabaseClient } from '../services/supabase';
import { ForbiddenState, LoadingState, RetryableErrorState } from '../components/AsyncState';

type GuardState = 'loading' | 'anonymous' | 'mfa_required' | 'forbidden' | 'allowed' | 'error';

export interface AdminGuardProps {
  client?: SupabaseClient;
  children?: ReactNode;
}

export function AdminGuard({ client = getSupabaseClient(), children }: AdminGuardProps) {
  const [state, setState] = useState<GuardState>('loading');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;

    async function verify() {
      setState('loading');
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      if (!current) return;
      if (sessionError) return setState('error');
      if (!sessionData.session) return setState('anonymous');

      const { data: aal, error: aalError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!current) return;
      if (aalError) return setState('error');
      if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') return setState('mfa_required');

      const { data, error } = await client.rpc('admin_get_session');
      if (!current) return;
      if (error) return setState(error.code === '42501' ? 'forbidden' : 'error');

      const record = Array.isArray(data) ? data[0] : data;
      const isAdmin = record?.is_admin === true;
      const isActive = record?.is_active !== false;
      setState(isAdmin && isActive ? 'allowed' : 'forbidden');
    }

    void verify();
    return () => { current = false; };
  }, [client, reload]);

  if (state === 'loading') return <LoadingState label="Verifying administrator access" />;
  if (state === 'anonymous') return <Navigate to="/login" replace />;
  if (state === 'mfa_required') return <Navigate to="/login" replace state={{ mfaRequired: true }} />;
  if (state === 'forbidden') return <ForbiddenState />;
  if (state === 'error') return <RetryableErrorState onRetry={() => setReload((n) => n + 1)} />;
  return <>{children ?? <Outlet />}</>;
}
