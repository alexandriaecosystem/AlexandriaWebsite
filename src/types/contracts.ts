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
  trackingHasEvents: boolean;
  trackingLastRecordedAt: string | null;
  trackingMissing: boolean;
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
export type KnowledgeConflictScanStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | string;

export interface KnowledgeConflict {
  id: string;
  sourceAKind: string | null;
  sourceADocumentId: string | null;
  sourceAOfficialSourceId: string | null;
  sourceAVersion: number | null;
  sourceATitle: string;
  claimA: string;
  authorityACode: string | null;
  authorityALabel: string | null;
  authorityAPriority: number;
  sourceAUrl: string | null;
  sourceBKind: string | null;
  sourceBDocumentId: string | null;
  sourceBOfficialSourceId: string | null;
  sourceBVersion: number | null;
  sourceBTitle: string;
  claimB: string;
  authorityBCode: string | null;
  authorityBLabel: string | null;
  authorityBPriority: number;
  sourceBUrl: string | null;
  explanation: string | null;
  category: string | null;
  topic: string | null;
  conflictType: string | null;
  timeScope: string | null;
  severity: string;
  confidence: number;
  blocking: boolean;
  status: string;
  detectedAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  relatedKnowledgeDocumentId: string | null;
  relatedWebsiteSourceId: string | null;
}

export interface KnowledgeApprovalResult {
  blocked: boolean;
  code: string | null;
  isApproved: boolean;
  conflictCount: number;
  conflicts: KnowledgeConflict[];
}

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
  conflictScanStatus: KnowledgeConflictScanStatus;
  conflictScannedVersion: number | null;
  conflictScannedAt: string | null;
  conflictScanError: string | null;
  openConflictCount: number;
  blockingConflictCount: number;
  approvalBlocked: boolean;
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

export interface OfficialSourceHealth {
  sourceId: string;
  familyId: string | null;
  pageTitle: string;
  canonicalUrl: string;
  language: string;
  canonicalLanguage: string | null;
  isFamilyCanonical: boolean;
  sourceType: string;
  authorityCode: string;
  authorityPriority: number;
  extractionStatus: string;
  currentVersion: number;
  conflictScanStatus: string;
  conflictScannedVersion: number | null;
  lastFetchedAt: string | null;
  lastSuccessfulFetch: string | null;
  lastChangedAt: string | null;
  freshnessTtlSeconds: number;
  isStale: boolean;
  hasBlockingConflict: boolean;
  lastError: string | null;
  isActive: boolean;
  removedAt: string | null;
  nextCrawlAt: string | null;
}

export interface OfficialCrawlRunSummary {
  id: string;
  syncType: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  fetchedCount: number;
  unchangedCount: number;
  changedCount: number;
  newCount: number;
  removedCount: number;
  failedCount: number;
  blockedCount: number;
  unsupportedCount: number;
  errorSummary: string | null;
}

export interface OfficialSourceChange {
  id: string;
  sourceId: string;
  sourceTitle: string;
  sourceUrl: string;
  previousVersion: number | null;
  currentVersion: number;
  changeKind: string;
  detectedAt: string;
  changeSummary: string | null;
  important: boolean;
  conflictCount: number;
  reviewStatus: string;
}

export interface KnowledgeCandidate {
  id: string;
  originalQuestion: string;
  proposedAnswer: string;
  extractedClaim: string | null;
  officialSourceId: string;
  sourceVersion: number;
  sourceUrl: string;
  sourceTitle: string;
  language: string;
  proposedCategory: string;
  authorityCode: string | null;
  authorityPriority: number;
  status: string;
  discoveryCount: number;
  firstDiscoveredAt: string;
  lastDiscoveredAt: string;
  promotedDocumentId: string | null;
}

export interface KnowledgeIntelligenceStatus {
  openConflicts: number;
  blockingConflicts: number;
  staleSources: number;
  failedSources: number;
  pendingCandidates: number;
  lastSuccessfulSync: string | null;
  officialSourceVersion: number;
  officialSourceHealth: OfficialSourceHealth[];
  recentCrawlRuns: OfficialCrawlRunSummary[];
  recentSourceChanges: OfficialSourceChange[];
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
