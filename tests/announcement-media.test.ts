import { describe, expect, it } from 'vitest';
import { validateAnnouncementDraft } from '../src/services/announcement-media';

const image = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'announcement.png',
  type: 'image/png',
  size: 1024,
  ...overrides,
});

describe('announcement media validation', () => {
  it('allows text-only announcements', () => {
    expect(validateAnnouncementDraft('Hello community', null)).toBeNull();
  });

  it('allows image-only announcements', () => {
    expect(validateAnnouncementDraft('', image())).toBeNull();
  });

  it('allows image and text announcements', () => {
    expect(validateAnnouncementDraft('Hello community', image())).toBeNull();
  });

  it('requires at least text or an image', () => {
    expect(validateAnnouncementDraft('   ', null)).toBe('Add text or an image.');
  });

  it('rejects unsupported image types', () => {
    expect(validateAnnouncementDraft('', image({ type: 'image/gif' }))).toBe('Use a JPG, PNG, or WebP image.');
  });

  it('rejects images larger than 5 MB', () => {
    expect(validateAnnouncementDraft('', image({ size: 5 * 1024 * 1024 + 1 }))).toBe('Image must be 5 MB or smaller.');
  });
});
