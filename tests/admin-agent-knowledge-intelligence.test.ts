import { describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_INTELLIGENCE_TOOLS,
  KNOWLEDGE_INTELLIGENCE_WRITE_TOOLS,
  executeSafeKnowledgeApproval,
  normalizeKnowledgeIntelligenceToolArgs,
  previewKnowledgeIntelligenceTool,
} from '../supabase/functions/admin-agent/knowledge-intelligence-tools';

describe('Admin AI Knowledge Intelligence safety', () => {
  it('keeps read tools separate from explicit-confirmation write tools', () => {
    expect([...KNOWLEDGE_INTELLIGENCE_TOOLS].sort()).toEqual([
      'get_knowledge_conflict',
      'get_knowledge_intelligence_status',
      'get_official_source_health',
      'list_knowledge_candidates',
      'list_knowledge_conflicts',
      'promote_knowledge_candidate',
      'reject_knowledge_candidate',
      'resolve_knowledge_conflict',
    ]);
    expect([...KNOWLEDGE_INTELLIGENCE_WRITE_TOOLS].sort()).toEqual([
      'promote_knowledge_candidate',
      'reject_knowledge_candidate',
      'resolve_knowledge_conflict',
    ]);
  });

  it('normalizes only supported conflict resolutions', () => {
    const conflictId = '11111111-1111-4111-8111-111111111111';
    expect(normalizeKnowledgeIntelligenceToolArgs('resolve_knowledge_conflict', {
      conflict_id: conflictId,
      action: 'keep_source_b',
      note: 'Official policy is authoritative.',
    })).toEqual({
      conflict_id: conflictId,
      action: 'KEEP_SOURCE_B',
      note: 'Official policy is authoritative.',
    });
    expect(() => normalizeKnowledgeIntelligenceToolArgs('resolve_knowledge_conflict', {
      conflict_id: conflictId,
      action: 'force_approve',
    })).toThrow('invalid_resolution_action');
  });

  it('never previews candidate promotion as approval', () => {
    expect(previewKnowledgeIntelligenceTool('promote_knowledge_candidate', {
      candidate_id: '11111111-1111-4111-8111-111111111111',
    })).toMatchObject({
      action: 'Promote candidate into normal knowledge processing/review',
      auto_approved: false,
    });
  });

  it('explains a blocked approval instead of claiming success', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        blocked: true,
        code: 'KNOWLEDGE_CONFLICT_BLOCKING',
        conflict_count: 1,
        conflicts: [{
          source_a_title: 'Uploaded document',
          source_b_title: 'Alexandria Redemption Policy',
          claim_a: 'Uploaded claim',
          claim_b: 'Verified claim',
          authority_a: 'Admin upload',
          authority_b: 'Official policy',
          severity: 'HIGH',
          confidence: 0.98,
        }],
      },
      error: null,
    });

    const result = await executeSafeKnowledgeApproval({ rpc } as never, {
      document_id: '11111111-1111-4111-8111-111111111111',
    }, 'en');

    expect(result).toMatchObject({ blocked: true, tool: 'approve_document' });
    expect(String(result.message)).toContain('Alexandria Redemption Policy');
    expect(String(result.message)).toContain('Uploaded claim');
    expect(String(result.message)).toContain('Verified claim');
    expect(String(result.message)).not.toContain('was approved');
  });

  it('reports approval only after the database confirms it', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { blocked: false, is_approved: true }, error: null });
    const result = await executeSafeKnowledgeApproval({ rpc } as never, {
      document_id: '11111111-1111-4111-8111-111111111111',
    }, 'en');
    expect(result).toMatchObject({ blocked: false, message: 'The knowledge document was approved.' });
  });
});
