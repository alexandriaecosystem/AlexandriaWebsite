import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface PublicFrontendConfig {
  supabaseUrl: string;
  supabasePublishableKey: string;
}

const forbiddenName = /(service.?role|n8n|whapi|telegram.*token|discord.*token|openrouter|secret)/i;

export function readPublicFrontendConfig(
  environment: Record<string, string | boolean | undefined> = import.meta.env,
): PublicFrontendConfig {
  const leaked = Object.keys(environment).find(
    (name) => name.startsWith('VITE_') && forbiddenName.test(name) && environment[name],
  );
  if (leaked) throw new Error(`Forbidden privileged browser variable: ${leaked}`);

  const supabaseUrl = String(environment.VITE_SUPABASE_URL ?? '').trim();
  const supabasePublishableKey = String(
    environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
  ).trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Missing public Supabase browser configuration');
  }
  const parsed = new URL(supabaseUrl);
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('VITE_SUPABASE_URL must be an HTTP(S) URL');
  }
  return { supabaseUrl: parsed.toString().replace(/\/$/, ''), supabasePublishableKey };
}

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    const config = readPublicFrontendConfig();
    browserClient = createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return browserClient;
}
