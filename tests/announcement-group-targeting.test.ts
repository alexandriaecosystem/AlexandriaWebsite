import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('announcement named group targeting', () => {
  it('loads named announcement targets instead of exposing raw group ids', () => {
    const operations = source('src/services/admin-operations.ts');
    const page = source('src/pages/AnnouncementsPage.tsx');

    expect(operations).toContain('export type AnnouncementTarget');
    expect(operations).toContain('listAnnouncementTargets');
    expect(operations).toContain("admin_list_announcement_targets");
    expect(page).toContain('listAnnouncementTargets');
    expect(page).toContain('selectedCommunityIds');
    expect(page).toContain('target.name');
    expect(page).not.toContain('externalTargetId');
  });

  it('passes exact selected communities through announcement creation', () => {
    const service = source('src/services/announcement-media.ts');
    expect(service).toContain('communityIds: string[]');
    expect(service).toContain('p_community_ids: input.communityIds');
    expect(service).toContain("Choose at least one target group or account.");
  });

  it('ships a backward-compatible database migration for exact target selection', () => {
    const migrationPath = 'supabase/migrations/20260905090000_announcement_named_group_targeting.sql';
    expect(existsSync(resolve(process.cwd(), migrationPath))).toBe(true);
    if (!existsSync(resolve(process.cwd(), migrationPath))) return;

    const migration = source(migrationPath);
    expect(migration).toContain('selected_community_ids uuid[]');
    expect(migration).toContain('admin_list_announcement_targets');
    expect(migration).toContain('p_community_ids uuid[]');
    expect(migration).toMatch(/id\s*=\s*any\s*\(ann\.selected_community_ids\)/i);
    expect(migration).toContain('ann.selected_community_ids is null');
  });
});
