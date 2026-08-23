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

export interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  approvedUsers: number;
  pendingReviews: number;
  blockedUsers: number;
  totalMessages: number;
  messagesToday: number;
  messagesLast7Days: number;
  messagesLast30Days: number;
  aiResponses: number;
  cachedResponses: number;
  cacheHitRate: number;
  inputTokens: number;
  outputTokens: number;
  aiCostTotal: number;
  aiCostToday: number;
  aiCost7Days: number;
  aiCost30Days: number;
  failedOperations: number;
}

export interface AiUsageSummary {
  days: number;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  cacheHitCount: number;
  cacheHitRate: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  avgCostPerCall: number;
  byPurpose: Record<string, {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    cacheHitCount: number;
  }>;
}

export interface AiUsageSeriesPoint {
  bucketDate: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  cacheHitCount: number;
  failedCount: number;
}

export interface PlatformStat {
  platform: string;
  messages: number;
  aiResponses: number;
  cachedResponses: number;
  aiCostUsd: number;
  totalTokens: number;
  activeMembers: number;
}

export interface ModelUsageStat {
  provider: string;
  model: string;
  calls: number;
  successfulCalls: number;
  failedCalls: number;
  cacheHitCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  avgCostPerCall: number;
  successRate: number;
}

export type KnowledgeProcessingStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | string;

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  category: string;
  language: string;
  isApproved: boolean;
  processingStatus: KnowledgeProcessingStatus;
  processingError: string | null;
  version: number;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  chunkCount: number;
}

export interface KnowledgeChunk {
  id: string;
  chunkIndex: number;
  content: string;
  version: number;
}

export interface KnowledgeDocumentDetail extends KnowledgeDocumentSummary {
  chunks: KnowledgeChunk[];
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
