# Knowledge Gap Admin Answers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin answer an unresolved knowledge-gap question and make that answer trusted, indexed Alexandria knowledge instead of merely marking the gap resolved.

**Architecture:** Add one authenticated, atomic Supabase RPC that validates the admin answer, creates or updates the gap-linked text knowledge document, approves it, queues the existing `KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED` outbox event, and marks the gap resolved. The React admin UI calls that RPC through `admin-operations.ts`; the existing n8n KB outbox worker remains unchanged and processes the queued document through the current extraction/chunking/embedding/version pipeline.

**Tech Stack:** React 19, TypeScript, Supabase/Postgres RPCs, Vitest/Testing Library, existing n8n KB outbox pipeline.

**Spec:** Approved in the September 8, 2026 conversation: replace knowledge-gap “Resolve only” with admin-entered answers that become trusted knowledge; do not add a WhatsApp Plus-vs-regular chart unless a trustworthy upstream field exists.

## Global Constraints

- Default to ZERO new n8n executions.
- Do not execute/test-run/trigger the live n8n workflow.
- Reuse `KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED`; do not create a parallel indexing architecture.
- The browser must only call authenticated admin RPCs; no service-role secret is exposed client-side.
- A gap is marked RESOLVED only after its trusted answer document and reprocessing request are successfully created in the same database transaction.
- Do not fabricate WhatsApp subscription classification.

---

### Task 1: Backend RPC contract

**Files:**
- Create: `supabase/migrations/20260908010000_knowledge_gap_admin_answers.sql`
- Test: `tests/knowledge-gap-admin-answer.test.ts`

**Interfaces:**
- Consumes: existing `knowledge_gaps`, `knowledge_documents`, `admin_create_knowledge_text_record`, `admin_approve_knowledge_document`, and `admin_request_knowledge_document_reprocessing` contracts.
- Produces: `admin_answer_knowledge_gap(p_gap_id uuid, p_answer text) returns jsonb` with `gap_id`, `status`, `resolved_document_id`, `answer`, and document/reprocessing metadata.

- [ ] **Step 1: Write the failing test**

Add a source-contract test that requires the new migration to define `admin_answer_knowledge_gap`, validate non-empty answer length, reuse the linked document when present, call the existing text-record/approval/reprocessing contracts, set `status='RESOLVED'`, and grant execution only to authenticated users.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge-gap-admin-answer.test.ts`
Expected: FAIL because the migration/RPC does not exist.

- [ ] **Step 3: Write minimal implementation**

Implement the atomic admin RPC with strict admin authorization, answer validation, idempotent linked-document reuse, trusted Q&A content, approval, reprocessing enqueue, and gap resolution.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge-gap-admin-answer.test.ts`
Expected: PASS.

### Task 2: Frontend service and UI

**Files:**
- Modify: `src/services/admin-operations.ts`
- Modify: `src/pages/AdminOperationsPages.tsx`
- Modify: `src/admin-operations.css`
- Test: `tests/knowledge-gap-admin-answer.test.tsx`

**Interfaces:**
- Consumes: `admin_answer_knowledge_gap`.
- Produces: `answerKnowledgeGap(client, gapId, answer)` and an admin answer editor on `KnowledgeGapsPage`.

- [ ] **Step 1: Write the failing test**

Render an open gap and require an `Add answer` action, textarea editor, save call to `admin_answer_knowledge_gap`, Ignore, and Reopen behavior; resolved linked gaps expose `Edit answer` rather than a blind Resolve button.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/knowledge-gap-admin-answer.test.tsx`
Expected: FAIL because the editor/service do not exist.

- [ ] **Step 3: Write minimal implementation**

Extend `KnowledgeGap` with the persisted answer returned by the listing RPC, add `answerKnowledgeGap`, and update `KnowledgeGapsPage` with accessible inline editor state and clear save/cancel/error states.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/knowledge-gap-admin-answer.test.tsx`
Expected: PASS.

### Task 3: n8n static verification and release

**Files:**
- No n8n workflow edit expected unless static inspection proves the existing reprocess event path cannot consume the new queued document.

**Interfaces:**
- Consumes: existing `KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED` outbox event.
- Produces: no new workflow architecture.

- [ ] **Step 1: Inspect the published/draft workflow statically**

Confirm the Community Outbox worker claims `KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED`, routes it to the KB job, requires an approved document, and enters the existing document indexing pipeline.

- [ ] **Step 2: Static validate only**

Do not execute or test-run the workflow. If no graph edit is required, record that explicitly.

- [ ] **Step 3: Verify repository diff and CI**

Run repository CI through the normal GitHub branch/pull-request checks, inspect failures if any, and fix only feature-related regressions.
