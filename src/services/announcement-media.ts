import type { SupabaseClient } from '@supabase/supabase-js';

export type AnnouncementPlatform = 'telegram' | 'discord' | 'whatsapp' | 'x' | 'instagram';
export type AnnouncementAudience = 'GENERAL' | 'APPROVED' | 'BOTH';

type AnnouncementImageLike = {
  name: string;
  type: string;
  size: number;
};

const MEDIA_BUCKET = 'announcement-media';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateAnnouncementDraft(content: string, image: AnnouncementImageLike | null): string | null {
  if (!content.trim() && !image) return 'Add text or an image.';
  if (image && !ALLOWED_IMAGE_TYPES.has(image.type)) return 'Use a JPG, PNG, or WebP image.';
  if (image && image.size > MAX_IMAGE_BYTES) return 'Image must be 5 MB or smaller.';
  return null;
}

function safeFilename(name: string) {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || 'announcement-image';
}

export async function createAnnouncementWithMedia(client: SupabaseClient, input: {
  content: string;
  destination: AnnouncementAudience;
  platforms: AnnouncementPlatform[];
  image?: File | null;
}) {
  const content = input.content.trim();
  const image = input.image ?? null;
  const validationError = validateAnnouncementDraft(content, image);
  if (validationError) throw new Error(validationError);
  if (!input.platforms.length) throw new Error('Choose at least one platform.');

  let mediaPath: string | null = null;

  try {
    if (image) {
      mediaPath = `announcements/${crypto.randomUUID()}-${safeFilename(image.name)}`;
      const uploaded = await client.storage.from(MEDIA_BUCKET).upload(mediaPath, image, {
        upsert: false,
        contentType: image.type,
      });
      if (uploaded.error) throw new Error(`Image upload failed: ${uploaded.error.message}`);
    }

    const created = await client.rpc('admin_create_announcement_with_media', {
      p_content: content,
      p_destination_level: input.destination,
      p_platforms: input.platforms,
      p_translations: {},
      p_media_bucket: mediaPath ? MEDIA_BUCKET : null,
      p_media_path: mediaPath,
      p_media_mime_type: image?.type ?? null,
      p_media_filename: image?.name ?? null,
    });

    if (created.error) throw new Error(created.error.message);
    if (!created.data) throw new Error('The server returned no announcement ID.');
    return String(created.data);
  } catch (error) {
    if (mediaPath) await client.storage.from(MEDIA_BUCKET).remove([mediaPath]).catch(() => undefined);
    throw error;
  }
}
