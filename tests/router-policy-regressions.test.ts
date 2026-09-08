import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const code = readFileSync('docs/production-audits/policies/final-cross-language-guard.code.txt', 'utf8');
function guard(text: string, extra: Record<string, unknown> = {}, source = code) {
  const input = { text, answer: 'Verified project information.', intent: 'PROJECT_OVERVIEW', language: 'en', project_relevant: true, cache_write_eligible: true, ...extra };
  return runInNewContext(`(function(){${source}\n})()`, { $input: { first: () => ({ json: input }) }, $: () => ({ first: () => ({ json: input }) }) }, { timeout: 500 })[0].json;
}
describe('offline Router policy regressions (no n8n execution)', () => {
  const ordinary = ['Comment fonctionne Alexandria ?', 'كيف يعمل مشروع Alexandria؟', 'Wie funktioniert Alexandria?', '¿Cómo funciona Alexandria?', 'Come funziona Alexandria?', 'Como funciona Alexandria?', 'Hoe werkt Alexandria?', 'Как работает Alexandria?', 'Where is Alexandria documented?'];
  it.each(ordinary)('preserves ordinary project question: %s', (text) => {
    expect(guard(text).purchase_policy).toBe(false);
    expect(guard(text).answer).toBe('Verified project information.');
  });
  it('reproduces the previous French false positive', () => {
    expect(guard(ordinary[0], {}, code.replace(' && getVerbRe.test(text)', '')).purchase_policy).toBe(true);
  });
  it.each(['Where can I buy Alexandria?', 'Comment acheter Alexandria?', 'كيف أشتري Alexandria؟', 'Wie kann ich Alexandria kaufen?', '¿Cómo comprar Alexandria?', 'Dove comprare Alexandria?', 'Where can I get Alexandria?', 'Où obtenir Alexandria?', 'كيف أحصل على Alexandria؟', 'Jak kupić Alexandria?', 'Как купить Alexandria?', '购买 Alexandria'])('continues blocking purchase requests: %s', (text) => {
    expect(guard(text).purchase_policy).toBe(true);
    expect(guard(text).cache_write_eligible).toBe(false);
  });
  it('keeps explicit purchase follow-ups blocked', () => {
    expect(guard('Which exchange?', { conversation_memory: { last_intent: 'PURCHASE_INTENT' } }).purchase_policy).toBe(true);
  });
});
const finalPolicy = readFileSync('docs/production-audits/policies/enforce-final-answer-policy.code.txt', 'utf8');
describe('official provenance preservation', () => {
  it('keeps canonical Alexandria source links intact', () => {
    const answer = 'Official reference: https://www.alexandriaecosystem.com/en';
    expect(guard('What is Alexandria?', { answer }, finalPolicy).answer).toBe(answer);
  });
  it('reproduces the old official-link removal bug', () => {
    const old = finalPolicy.replace('/(?<![A-Za-z0-9])ALEXA(?![A-Za-z0-9])/i.test(url)', '/ALEXA/i.test(url)');
    expect(guard('What is Alexandria?', { answer: 'Source: https://alexandriaecosystem.com' }, old).answer).not.toContain('https://alexandriaecosystem.com');
  });
  it('still replaces standalone legacy names and prevents transformed answers from entering cache', () => {
    const result = guard('What is Alexandria?', { answer: 'ALEXA is the legacy symbol.' }, finalPolicy);
    expect(result.answer).not.toMatch(/\bALEXA\b/i);
    expect(result.cache_write_eligible).toBe(false);
  });
  it('does not cache a response replaced by the purchase policy', () => {
    const result = guard('Where can I buy Alexandria?', { intent: 'PURCHASE_INTENT' }, finalPolicy);
    expect(result.cache_write_eligible).toBe(false);
  });
});
