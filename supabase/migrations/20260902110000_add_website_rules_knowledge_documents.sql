-- Add knowledge-base documents sourced from https://www.alexandriaecosystem.com
-- (redemption policy incl. wallet min/max, wallet/transfer limits, community join/KYC,
-- support language policy, and key disclaimers). Mirrors exactly what
-- admin_create_knowledge_text_record() produces (PENDING + outbox event so the
-- Crypto Workflow's KB-processing branch chunks/embeds them normally), so an
-- admin still needs to approve each one from the Knowledge Base page once it
-- reaches READY.

with doc1 as (
  insert into public.knowledge_documents
    (id, title, category, content, language, storage_path, is_approved, processing_status)
  values (
    gen_random_uuid(),
    'Alexandria Redemption Policy - Wallet Minimum & Maximum',
    'REDEMPTION',
    $md$Redemption is only available when the Company formally opens a redemption window; it is not always active. The window currently published on the website runs from 27/08/2026 to 31/03/2027, at the Company's discretion.

Minimum amount: a wallet must hold at least the minimum threshold representing the weight of one gram of gold under the current reserve/token ratio. Because this is tied to the size of the gold reserve, the exact Alexandria token count for the minimum moves with the reserve rather than being a fixed number of tokens.

Maximum amount: the Company does not set a fixed maximum number of tokens that can be redeemed in a single request.

Fee: a fixed operational fee of 2.5% of the redemption transaction value is charged, covering administration, verification, storage, insurance, transportation, and legal costs.

Eligibility: applicants must complete identity verification (KYC) and meet Anti-Money Laundering / Counter-Terrorist Financing (AML/CFT) requirements, plus any additional documents the Company requests.

Process: submit through the Company's official channels, pass KYC/AML verification; requests are processed in chronological or organizational order at the Company's discretion. The Company reserves the right to accept or reject any redemption request, and a rejection creates no claim or compensation right for the member.

Current published gold reserve backing: 368 g, with a stated redemption rate of 1000 Alexandria tokens redeemable for 0.00368 g of gold.

Source: https://www.alexandriaecosystem.com/en/redemption-policy$md$,
    'en',
    gen_random_uuid()::text || '.md',
    false,
    'PENDING'
  )
  returning id
)
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
select 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED', 'knowledge_document', id,
       jsonb_build_object('document_id', id, 'version', 1, 'reason', 'created'),
       'knowledge-reprocess:' || id::text || ':' || gen_random_uuid()::text
from doc1;

with doc2 as (
  insert into public.knowledge_documents
    (id, title, category, content, language, storage_path, is_approved, processing_status)
  values (
    gen_random_uuid(),
    'Alexandria Wallet Holding & Transfer Limits',
    'TOKENOMICS',
    $md$The Alexandria token smart contract (TRC-20 on the TRON network, contract TEoUqbkBtzSbGmUspNP3ztqVx7AzqhCLJr) has technical controls built in for stability and ecosystem protection:
- A maximum transfer amount limit per transaction.
- A maximum limit on the quantity of tokens that may be held in a single wallet.
- The ability to temporarily suspend transfers or restrict/block an address for security, legal, or exceptional-circumstance reasons.

Per the official whitepaper, these limits exist "primarily to support stability and protect the ecosystem," not to manage price or direct trading. The whitepaper does not publish the exact numeric values of the maximum wallet holding or maximum transfer amount. When a member asks for the precise figures, tell them these limits exist by design, that the specific numbers are not publicly disclosed in the whitepaper, and offer to have the team follow up if they need the current figures.

A fixed 1% fee applies automatically to token transfers at the smart-contract level. This fee cannot be modified after deployment.

Total supply is fixed at 100,000,000 Alexandria tokens (18 decimals), minted once in a single transaction, with no further minting, burning, or supply restructuring possible.

Source: https://www.alexandriaecosystem.com/en/whitepaper$md$,
    'en',
    gen_random_uuid()::text || '.md',
    false,
    'PENDING'
  )
  returning id
)
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
select 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED', 'knowledge_document', id,
       jsonb_build_object('document_id', id, 'version', 1, 'reason', 'created'),
       'knowledge-reprocess:' || id::text || ':' || gen_random_uuid()::text
from doc2;

with doc3 as (
  insert into public.knowledge_documents
    (id, title, category, content, language, storage_path, is_approved, processing_status)
  values (
    gen_random_uuid(),
    'How to Join the Alexandria Community & KYC Requirements',
    'COMMUNITY',
    $md$To join the official Alexandria community, members complete a KYC form with: first and last name, email address, country of residence, phone number, and an identification picture (passport or national ID, as JPG, PNG, or PDF). An X (Twitter) handle and Telegram ID are optional fields.

The whitepaper also notes that KYC procedures and Anti-Money Laundering (AML) / Counter-Terrorist Financing (CFT) checks may be required more broadly across the ecosystem, and that each member is responsible for complying with the laws, regulations, and regulatory restrictions of their own jurisdiction.

Join here: https://www.alexandriaecosystem.com/en/community$md$,
    'en',
    gen_random_uuid()::text || '.md',
    false,
    'PENDING'
  )
  returning id
)
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
select 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED', 'knowledge_document', id,
       jsonb_build_object('document_id', id, 'version', 1, 'reason', 'created'),
       'knowledge-reprocess:' || id::text || ':' || gen_random_uuid()::text
from doc3;

with doc4 as (
  insert into public.knowledge_documents
    (id, title, category, content, language, storage_path, is_approved, processing_status)
  values (
    gen_random_uuid(),
    'Support Language Policy - Reply in the Member''s Own Language',
    'SUPPORT',
    $md$When a community member greets the bot or writes in a given language, the bot replies in that same language rather than defaulting to a fixed one. Language is auto-detected from the member's message text (Arabic, English, Spanish, French, German, Italian, Portuguese, Turkish, Dutch, Indonesian, Polish, Russian, Ukrainian, Japanese, Korean, Chinese, Thai, Greek, and Hebrew are recognized, including common greetings in each). If the language cannot be confidently detected from a very short or ambiguous message, the bot falls back to its standard per-platform default until the member provides more text to detect from.$md$,
    'en',
    gen_random_uuid()::text || '.md',
    false,
    'PENDING'
  )
  returning id
)
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
select 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED', 'knowledge_document', id,
       jsonb_build_object('document_id', id, 'version', 1, 'reason', 'created'),
       'knowledge-reprocess:' || id::text || ':' || gen_random_uuid()::text
from doc4;

with doc5 as (
  insert into public.knowledge_documents
    (id, title, category, content, language, storage_path, is_approved, processing_status)
  values (
    gen_random_uuid(),
    'Alexandria Key Disclaimers',
    'DISCLAIMERS',
    $md$Alexandria token is not an investment instrument, security, investment fund, or any form of financial product, and holding it grants no ownership, voting, profit-sharing, or contractual claim rights. The Company makes no promises, undertakings, or guarantees concerning profits, returns, or preservation of value, and assumes no responsibility for losses, damages, or market-value changes. The Company is not responsible for liquidity or trading of Alexandria token on third-party platforms that operate independently of the Company. This information is not financial advice.

Source: https://www.alexandriaecosystem.com/en/whitepaper$md$,
    'en',
    gen_random_uuid()::text || '.md',
    false,
    'PENDING'
  )
  returning id
)
insert into public.outbox_events (event_type, aggregate_type, aggregate_id, payload, idempotency_key)
select 'KNOWLEDGE_DOCUMENT_REPROCESS_REQUESTED', 'knowledge_document', id,
       jsonb_build_object('document_id', id, 'version', 1, 'reason', 'created'),
       'knowledge-reprocess:' || id::text || ':' || gen_random_uuid()::text
from doc5;
