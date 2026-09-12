update public.knowledge_documents
set is_approved = true, approved_by = 'c5c19fae-17ee-4b82-85af-cc27361736ab', approved_at = now()
where id in (
  '75e16704-2d6e-47fc-bf17-489f6ee64a62', -- Redemption Policy (Full Official Text)
  'd9d8fe7f-6840-4f5c-9865-f6c576934cde', -- How to Join & KYC Requirements
  'd8c1a611-6b89-4d26-9749-93a7853d36d8', -- Support Language Policy
  '5ae401d6-d641-4757-ba89-e23fcbf7c4f0'  -- Key Disclaimers
)
and processing_status = 'READY';

select public.bump_knowledge_version();
