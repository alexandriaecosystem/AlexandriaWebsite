export type MessagingPlatform = 'telegram' | 'discord' | 'whatsapp';

export interface DirectMessageV1 {
  contract: 'dm.v1';
  correlationId: string;
  platform: MessagingPlatform;
  platformMessageId: string;
  platformUserId: string;
  chatId: string;
  receivedAt: string;
  isPrivate: true;
  isBotOrSelf: boolean;
  messageType: 'text' | 'unsupported';
  text: string | null;
  language?: string | null;
  metadata: Record<string, unknown>;
}

export interface DirectMessageReplyV1 {
  contract: 'dm.reply.v1';
  correlationId: string;
  disposition: 'reply' | 'ignore' | 'duplicate' | 'rate_limited' | 'failed';
  text?: string;
  reasonCode?: string;
}

export type Recommendation =
  | 'HIGHLY_RECOMMENDED'
  | 'RECOMMENDED'
  | 'MANUAL_REVIEW'
  | 'NOT_RECOMMENDED';

export interface HiddenEvaluationV1 {
  contract: 'passive-evaluation.v1';
  score: number;
  recommendation: Recommendation;
  categoryScores: Record<string, number>;
  strengths: string[];
  concerns: string[];
  evidence: Array<{ evidenceId: string; category: string; rationale: string }>;
  summary: string;
  modelVersion: string;
  schemaVersion: string;
}

export type ReviewStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type AccessState =
  | 'GENERAL'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'INVITE_SENT'
  | 'JOIN_REQUESTED'
  | 'ACTIVE'
  | 'LEFT'
  | 'REMOVED';

export interface AccessOperationV1 {
  contract: 'access-operation.v1';
  operationId: string;
  correlationId: string;
  userId: string;
  platform: MessagingPlatform;
  requestedState: AccessState;
  idempotencyKey: string;
}

export interface AccessResultV1 {
  contract: 'access-result.v1';
  operationId: string;
  state: AccessState;
  externalReference?: string;
  error?: ContractError;
}

export type OutboxStatus = 'PENDING' | 'CLAIMED' | 'PROCESSED' | 'DEAD_LETTER';
export interface OutboxEventV1 {
  contract: 'outbox-event.v1';
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  idempotencyKey: string;
  status: OutboxStatus;
  attemptCount: number;
  availableAt: string;
  payload: Record<string, unknown>;
}

export interface ContractError {
  contract: 'error.v1';
  code: string;
  message: string;
  correlationId?: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface AdminSession {
  userId: string;
  email: string | null;
  isActiveAdmin: boolean;
}

export interface PendingReviewSummary {
  reviewId: string;
  userId: string;
  platform: MessagingPlatform;
  createdAt: string;
  score: number;
  recommendation: Recommendation;
  status: 'PENDING_REVIEW';
}

export interface EvaluationDetail extends PendingReviewSummary {
  strengths: string[];
  concerns: string[];
  evidence: Array<{ evidenceId: string; category: string; rationale: string }>;
  summary: string;
  categoryScores: Record<string, number>;
  version: number;
}

export interface ReviewCounts {
  pendingReviews: number;
  failedOperations: number;
}

export interface ReviewListItem {
  applicationId: string;
  userId: string;
  platform: MessagingPlatform;
  submittedAt: string;
  score: number;
  recommendation: Recommendation;
  version: number;
}

export interface ReviewDetail extends ReviewListItem {
  status: ReviewStatus;
  strengths: string[];
  concerns: string[];
  evidence: unknown[];
  summary: string;
  categoryScores: Record<string, number>;
  evaluationRunId?: string | null;
}

export interface DeadLetterOperation {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  lastError: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
}

export interface ApplicationAuditDetail {
  application: Record<string, unknown>;
  answers: unknown[];
  categoryScores: unknown[];
  evaluations: unknown[];
  decisions: unknown[];
  access: unknown[];
}
