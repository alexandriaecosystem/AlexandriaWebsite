-- The Delete Previous Chunks node bug (just fixed in the workflow: it emitted zero
-- output items whenever there was nothing to delete, silently killing the chain
-- before Complete Knowledge Outbox ever ran) left these two documents' outbox
-- events stuck in PROCESSING/DEAD_LETTER even though the documents themselves
-- correctly reached READY. Close the bookkeeping out directly rather than
-- re-running the whole embed/chunk pipeline again for no reason.
update public.outbox_events
set status = 'PROCESSED', processed_at = now(), last_error = null
where id in (
  '3eea9ff9-7ae4-47c0-9e3c-2017eb1ac0f1',  -- redemption policy doc, now READY
  '204970d2-1ddd-4f1e-a7bc-73d157e65b36'   -- wallet holding & transfer limits doc, already READY + approved
);

select bump_knowledge_version();
