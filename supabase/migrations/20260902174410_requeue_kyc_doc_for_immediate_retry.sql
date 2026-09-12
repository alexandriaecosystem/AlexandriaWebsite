-- Fixed the Delete Stale Knowledge Chunks alwaysOutputData bug that killed this
-- document's processing chain right after Mark Document Processing. Requeue for
-- the next poll instead of waiting out the 10-minute stuck-recovery window.
update public.knowledge_documents set processing_status = 'PENDING', processing_error = null
where id = 'd9d8fe7f-6840-4f5c-9865-f6c576934cde';

update public.outbox_events
set status = 'PENDING', available_at = now(), claimed_at = null
where id = 'f80eaafc-88d9-45b0-bea5-ce1699908858';
