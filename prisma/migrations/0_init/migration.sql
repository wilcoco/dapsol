-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 10000,
    "trustLevel" INTEGER NOT NULL DEFAULT 1,
    "hubScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "authorityScore" DOUBLE PRECISION NOT NULL DEFAULT 100.0,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "interestTags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "QASet" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "creatorId" TEXT NOT NULL,
    "parentQASetId" TEXT,
    "parentMessageCount" INTEGER NOT NULL DEFAULT 0,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3),
    "searchKeywords" TEXT,
    "embedding" TEXT,
    "embeddingModel" TEXT,
    "embeddingVec" vector(1536),
    "knowledgeCard" TEXT,
    "topicClusterId" TEXT,
    "creatorAuthorityStake" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "authorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "qualityPool" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "burnedAmount" INTEGER NOT NULL DEFAULT 0,
    "totalInvested" INTEGER NOT NULL DEFAULT 0,
    "investorCount" INTEGER NOT NULL DEFAULT 0,
    "negativeInvested" INTEGER NOT NULL DEFAULT 0,
    "negativeCount" INTEGER NOT NULL DEFAULT 0,
    "negativePool" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QASet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "qaSetId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "originalContent" TEXT,
    "isImproved" BOOLEAN NOT NULL DEFAULT false,
    "improvedById" TEXT,
    "improvedAt" TIMESTAMP(3),
    "improvementNote" TEXT,
    "isInsight" BOOLEAN NOT NULL DEFAULT false,
    "insightReason" TEXT,
    "insightDetectedAt" TIMESTAMP(3),
    "relationSimple" TEXT,
    "relationQ1Q2" TEXT,
    "relationA1Q2" TEXT,
    "relationStance" TEXT,
    "gapQuestionId" TEXT,
    "isGapResponse" BOOLEAN NOT NULL DEFAULT false,
    "isHumanAuthored" BOOLEAN NOT NULL DEFAULT false,
    "authorUserId" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "qaSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isNegative" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "effectiveAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulativeReward" INTEGER NOT NULL DEFAULT 0,
    "huntingReason" TEXT,
    "huntingEvidence" TEXT,
    "huntingTargetMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardEvent" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "qaSetId" TEXT NOT NULL,
    "sourceInvestmentId" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpinionNode" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpinionNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeRelation" (
    "id" TEXT NOT NULL,
    "sourceQASetId" TEXT,
    "sourceOpinionId" TEXT,
    "targetQASetId" TEXT,
    "targetOpinionId" TEXT,
    "relationType" TEXT NOT NULL,
    "customLabel" TEXT,
    "isAIGenerated" BOOLEAN NOT NULL DEFAULT true,
    "isUserModified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicCluster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "centroidEmbedding" TEXT,
    "synthesisText" TEXT,
    "synthesizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TopicCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClusterRelation" (
    "id" TEXT NOT NULL,
    "sourceClusterId" TEXT NOT NULL,
    "targetClusterId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClusterRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEvolutionEvent" (
    "id" TEXT NOT NULL,
    "topicClusterId" TEXT NOT NULL,
    "qaSetId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeEvolutionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeGap" (
    "id" TEXT NOT NULL,
    "topicClusterId" TEXT NOT NULL,
    "gapType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedQASetIds" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'medium',
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedByQASetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTopicContribution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicClusterId" TEXT NOT NULL,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "answersImproved" INTEGER NOT NULL DEFAULT 0,
    "insightsContributed" INTEGER NOT NULL DEFAULT 0,
    "rebuttalsProvided" INTEGER NOT NULL DEFAULT 0,
    "evidenceAdded" INTEGER NOT NULL DEFAULT 0,
    "topicAuthority" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastContributedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTopicContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "qaSetId" TEXT,
    "investmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QASetTag" (
    "qaSetId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "QASetTag_pkey" PRIMARY KEY ("qaSetId","tagId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "qaSetId" TEXT,
    "amount" INTEGER,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "QASet_creatorId_idx" ON "QASet"("creatorId");

-- CreateIndex
CREATE INDEX "QASet_isShared_sharedAt_idx" ON "QASet"("isShared", "sharedAt");

-- CreateIndex
CREATE INDEX "QASet_isShared_totalInvested_idx" ON "QASet"("isShared", "totalInvested");

-- CreateIndex
CREATE INDEX "QASet_topicClusterId_idx" ON "QASet"("topicClusterId");

-- CreateIndex
CREATE INDEX "Message_qaSetId_orderIndex_idx" ON "Message"("qaSetId", "orderIndex");

-- CreateIndex
CREATE INDEX "Investment_qaSetId_position_idx" ON "Investment"("qaSetId", "position");

-- CreateIndex
CREATE INDEX "Investment_userId_idx" ON "Investment"("userId");

-- CreateIndex
CREATE INDEX "RewardEvent_recipientId_createdAt_idx" ON "RewardEvent"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardEvent_qaSetId_idx" ON "RewardEvent"("qaSetId");

-- CreateIndex
CREATE INDEX "OpinionNode_userId_idx" ON "OpinionNode"("userId");

-- CreateIndex
CREATE INDEX "NodeRelation_sourceQASetId_idx" ON "NodeRelation"("sourceQASetId");

-- CreateIndex
CREATE INDEX "NodeRelation_targetQASetId_idx" ON "NodeRelation"("targetQASetId");

-- CreateIndex
CREATE INDEX "NodeRelation_sourceOpinionId_idx" ON "NodeRelation"("sourceOpinionId");

-- CreateIndex
CREATE INDEX "NodeRelation_targetOpinionId_idx" ON "NodeRelation"("targetOpinionId");

-- CreateIndex
CREATE INDEX "TopicCluster_name_idx" ON "TopicCluster"("name");

-- CreateIndex
CREATE INDEX "ClusterRelation_sourceClusterId_idx" ON "ClusterRelation"("sourceClusterId");

-- CreateIndex
CREATE INDEX "ClusterRelation_targetClusterId_idx" ON "ClusterRelation"("targetClusterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClusterRelation_sourceClusterId_targetClusterId_relationTyp_key" ON "ClusterRelation"("sourceClusterId", "targetClusterId", "relationType");

-- CreateIndex
CREATE INDEX "KnowledgeEvolutionEvent_topicClusterId_createdAt_idx" ON "KnowledgeEvolutionEvent"("topicClusterId", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeEvolutionEvent_qaSetId_idx" ON "KnowledgeEvolutionEvent"("qaSetId");

-- CreateIndex
CREATE INDEX "KnowledgeEvolutionEvent_userId_idx" ON "KnowledgeEvolutionEvent"("userId");

-- CreateIndex
CREATE INDEX "KnowledgeGap_topicClusterId_isResolved_idx" ON "KnowledgeGap"("topicClusterId", "isResolved");

-- CreateIndex
CREATE INDEX "UserTopicContribution_userId_idx" ON "UserTopicContribution"("userId");

-- CreateIndex
CREATE INDEX "UserTopicContribution_topicClusterId_topicAuthority_idx" ON "UserTopicContribution"("topicClusterId", "topicAuthority");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicContribution_userId_topicClusterId_key" ON "UserTopicContribution"("userId", "topicClusterId");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "Tag_slug_idx" ON "Tag"("slug");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_qaSetId_createdAt_idx" ON "AuditLog"("qaSetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASet" ADD CONSTRAINT "QASet_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASet" ADD CONSTRAINT "QASet_parentQASetId_fkey" FOREIGN KEY ("parentQASetId") REFERENCES "QASet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASet" ADD CONSTRAINT "QASet_topicClusterId_fkey" FOREIGN KEY ("topicClusterId") REFERENCES "TopicCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_qaSetId_fkey" FOREIGN KEY ("qaSetId") REFERENCES "QASet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_improvedById_fkey" FOREIGN KEY ("improvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_qaSetId_fkey" FOREIGN KEY ("qaSetId") REFERENCES "QASet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardEvent" ADD CONSTRAINT "RewardEvent_sourceInvestmentId_fkey" FOREIGN KEY ("sourceInvestmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpinionNode" ADD CONSTRAINT "OpinionNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRelation" ADD CONSTRAINT "NodeRelation_sourceQASetId_fkey" FOREIGN KEY ("sourceQASetId") REFERENCES "QASet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRelation" ADD CONSTRAINT "NodeRelation_sourceOpinionId_fkey" FOREIGN KEY ("sourceOpinionId") REFERENCES "OpinionNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRelation" ADD CONSTRAINT "NodeRelation_targetQASetId_fkey" FOREIGN KEY ("targetQASetId") REFERENCES "QASet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeRelation" ADD CONSTRAINT "NodeRelation_targetOpinionId_fkey" FOREIGN KEY ("targetOpinionId") REFERENCES "OpinionNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterRelation" ADD CONSTRAINT "ClusterRelation_sourceClusterId_fkey" FOREIGN KEY ("sourceClusterId") REFERENCES "TopicCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClusterRelation" ADD CONSTRAINT "ClusterRelation_targetClusterId_fkey" FOREIGN KEY ("targetClusterId") REFERENCES "TopicCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEvolutionEvent" ADD CONSTRAINT "KnowledgeEvolutionEvent_topicClusterId_fkey" FOREIGN KEY ("topicClusterId") REFERENCES "TopicCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeGap" ADD CONSTRAINT "KnowledgeGap_topicClusterId_fkey" FOREIGN KEY ("topicClusterId") REFERENCES "TopicCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTopicContribution" ADD CONSTRAINT "UserTopicContribution_topicClusterId_fkey" FOREIGN KEY ("topicClusterId") REFERENCES "TopicCluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASetTag" ADD CONSTRAINT "QASetTag_qaSetId_fkey" FOREIGN KEY ("qaSetId") REFERENCES "QASet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QASetTag" ADD CONSTRAINT "QASetTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- pgvector: Create IVFFlat index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_qaset_embedding_vec ON "QASet"
  USING ivfflat ("embeddingVec" vector_cosine_ops) WITH (lists = 100);
