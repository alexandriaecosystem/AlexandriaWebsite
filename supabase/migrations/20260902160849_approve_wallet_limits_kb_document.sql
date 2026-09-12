update public.knowledge_documents
set is_approved = true, approved_by = 'c5c19fae-17ee-4b82-85af-cc27361736ab', approved_at = now(), updated_at = now()
where id = '129cc470-7b2e-4c42-8e3f-3e778283c583' and processing_status = 'READY';

select public.bump_knowledge_version();
