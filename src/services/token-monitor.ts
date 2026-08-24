import type { SupabaseClient } from '@supabase/supabase-js';

export type TokenTransfer = {
  transactionId: string;
  block: number;
  timestamp: number;
  from: string;
  to: string;
  fromTag: string;
  toTag: string;
  amount: number;
  amountRaw: string;
  decimals: number;
  confirmed: boolean;
  result: string;
  riskTransaction: boolean;
  fromIsContract: boolean;
  toIsContract: boolean;
};

export type TokenMonitorData = {
  source: string;
  contract: string;
  fetchedAt: string;
  token: {
    symbol: string;
    name: string;
    decimals: number;
    holdersCount: number;
    transferCount: number;
    transfers24h: number;
    transfer24hRate: number;
    totalSupply: number;
    marketCapUsd: number;
    priceUsd: number;
    priceChange24h: number;
    volume24hUsd: number;
    liquidity24h: number;
    issuerAddress: string;
    createdAt: number;
    iconUrl: string;
    riskTag: string;
  };
  summary: {
    fetchedTransfers: number;
    uniqueAddresses: number;
    recentVolume: number;
    failedCount: number;
    riskCount: number;
    largestTransfer: TokenTransfer | null;
  };
  transfers: TokenTransfer[];
};

async function readFunctionError(error: unknown): Promise<string> {
  const maybe = error as { message?: string; context?: Response };
  if (maybe?.context && typeof maybe.context.json === 'function') {
    try {
      const body = await maybe.context.json() as { error?: string; message?: string };
      if (body.error === 'TRONSCAN_API_KEY_NOT_CONFIGURED') {
        return 'TRONSCAN API access is ready, but TRONSCAN_API_KEY has not been configured in Supabase yet.';
      }
      if (body.message) return body.message;
      if (body.error) return body.error;
    } catch {
      // Fall through to the generic function error.
    }
  }
  return maybe?.message || 'Could not load TRONSCAN token data.';
}

export async function getTokenMonitorData(client: SupabaseClient): Promise<TokenMonitorData> {
  const { data, error } = await client.functions.invoke('tronscan-token-monitor', { method: 'GET' });
  if (error) throw new Error(await readFunctionError(error));
  if (!data || typeof data !== 'object') throw new Error('TRONSCAN returned no token data.');
  return data as TokenMonitorData;
}
