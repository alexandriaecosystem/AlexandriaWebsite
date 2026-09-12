-- The redemption-policy document reached processing_status='READY' with is_approved=true
-- and approved_at set, but approved_by was null and it had zero knowledge_chunks rows --
-- an inconsistent state (approved with nothing to retrieve). Reset it cleanly and requeue
-- for a fresh chunk/embed pass, matching admin_request_knowledge_document_reprocessing.
delete from public.knowledge_chunks where document_id = '75e16704-2d6e-47fc-bf17-489f6ee64a62';

update public.knowledge_documents
set is_approved = false, approved_by = null, approved_at = null,
    processing_status = 'PENDING', processing_error = null, updated_at = now()
where id = '75e16704-2d6e-47fc-bf17-489f6ee64a62';

insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
select 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED', 'knowledge_document', '75e16704-2d6e-47fc-bf17-489f6ee64a62',
       jsonb_build_object('document_id', '75e16704-2d6e-47fc-bf17-489f6ee64a62', 'reason', 'requeue_after_inconsistent_ready_state'),
       'knowledge-reprocess:75e16704-2d6e-47fc-bf17-489f6ee64a62:' || gen_random_uuid()::text
where not exists (
  select 1 from public.outbox_events
  where aggregate_id = '75e16704-2d6e-47fc-bf17-489f6ee64a62'
    and event_type = 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED'
    and status in ('PENDING','PROCESSING')
);
