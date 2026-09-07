import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function migrationSource() {
  const directory = join(root, 'supabase', 'migrations');
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n');
}

describe('knowledge gap admin answer backend contract', () => {
  it('defines one authenticated RPC that turns an admin answer into linked trusted knowledge', () => {
    const source = migrationSource();

    expect(source).toContain('admin_answer_knowledge_gap');
    expect(source).toMatch(/add column if not exists admin_answer text/i);
    expect(source).toMatch(/add column if not exists answered_by uuid/i);
    expect(source).toMatch(/add column if not exists answered_at timestamptz/i);
    expect(source).toMatch(/is_community_admin\(auth\.uid\(\)\)/i);
    expect(source).toMatch(/length\(v_answer\).*between 2 and 20000/is);
    expect(source).toContain('resolved_document_id');
    expect(source).toContain('KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED');
    expect(source).toMatch(/is_approved\s*=\s*true/i);
    expect(source).toMatch(/processing_status\s*=\s*'PENDING'/i);
    expect(source).toMatch(/status\s*=\s*'RESOLVED'/i);
    expect(source).toMatch(/grant execute on function public\.admin_answer_knowledge_gap\(uuid, text\) to authenticated/i);
  });

  it('deactivates linked trusted knowledge when an answered gap is reopened', () => {
    const source = migrationSource();
    expect(source).toContain('admin_reopen_knowledge_gap');
    expect(source).toMatch(/is_approved\s*=\s*false/i);
    expect(source).toMatch(/delete from public\.knowledge_chunks/i);
    expect(source).toContain('bump_knowledge_version');
    expect(source).toMatch(/grant execute on function public\.admin_reopen_knowledge_gap\(uuid\) to authenticated/i);
  });

  it('returns saved admin answers from the knowledge-gap listing contract', () => {
    const source = migrationSource();
    expect(source).toMatch(/create or replace function public\.admin_list_knowledge_gaps/i);
    expect(source).toContain('admin_answer');
    expect(source).toContain('answered_at');
  });

  it('adds typed frontend service calls for answer and reopen', () => {
    const source = readFileSync(join(root, 'src', 'services', 'knowledge-gaps.ts'), 'utf8');
    expect(source).toContain('adminAnswer: string | null');
    expect(source).toContain('answeredAt: string | null');
    expect(source).toContain('export async function answerKnowledgeGap');
    expect(source).toContain("client.rpc('admin_answer_knowledge_gap'");
    expect(source).toContain('export async function reopenKnowledgeGap');
    expect(source).toContain("client.rpc('admin_reopen_knowledge_gap'");
  });
});
