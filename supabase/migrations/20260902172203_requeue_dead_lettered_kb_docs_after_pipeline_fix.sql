-- Two real bugs were just fixed in the Crypto Workflow's KB-processing branch:
--   1) reprocessing never deleted a document's old knowledge_chunks rows first, so any
--      retry after a partial failure hit a 409 unique-constraint conflict forever
--      (this is what was stuck-looping the redemption policy document);
--   2) when the outbox poller claimed several KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED
--      events in one cycle, only the first ever got processed - the rest sat claimed
--      with no outbox completion until they timed out and hit DEAD_LETTER after 8
--      attempts without ever actually running (this is what happened to the other 3
--      pending documents).
-- Both are fixed now, but the 4 affected documents' outbox events already burned
-- through their 8 attempts and are stuck in DEAD_LETTER, which claim_outbox_events()
-- never reclaims. Manually reset them so the next poll picks them up fresh.

-- Clear any stale chunks left over from earlier failed attempts (redundant with the
-- workflow's own new cleanup step, but ensures a clean slate right now).
delete from public.knowledge_chunks
where document_id in (
  '75e16704-2d6e-47fc-bf17-489f6ee64a62',
  'd9d8fe7f-6840-4f5c-9865-f6c576934cde',
  'd8c1a611-6b89-4d26-9749-93a7853d36d8',
  '5ae401d6-d641-4757-ba89-e23fcbf7c4f0'
);

update public.knowledge_documents
set processing_status = 'PENDING', processing_error = null
where id in (
  '75e16704-2d6e-47fc-bf17-489f6ee64a62',
  'd9d8fe7f-6840-4f5c-9865-f6c576934cde',
  'd8c1a611-6b89-4d26-9749-93a7853d36d8',
  '5ae401d6-d641-4757-ba89-e23fcbf7c4f0'
);

update public.outbox_events
set status = 'PENDING', attempt_count = 0, available_at = now(), claimed_at = null, processed_at = null, last_error = null
where id in (
  '3eea9ff9-7ae4-47c0-9e3c-2017eb1ac0f1',
  '5fe78911-cdb1-4cd9-b2d4-a55dad3b8d2a',
  'b3fd092f-7dfb-421f-b878-b5418022bbfc',
  'f80eaafc-88d9-45b0-bea5-ce1699908858'
);
