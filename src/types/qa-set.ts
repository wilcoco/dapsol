export interface InvestmentData {
  id: string;
  userId: string;
  amount: number;
  position: number;
  isActive: boolean;
  isNegative: boolean;
  cumulativeReward: number;
  // Hunting (사냥) metadata
  huntingReason: string | null;
  huntingEvidence: string | null;
  huntingTargetMessageId: string | null;
  createdAt: string | Date;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
}

export interface KnowledgeCardData {
  coreClaim: string;
  evidence: string[];
  conditions: string[];
  limitations: string[];
  confidence: "high" | "medium" | "low";
  extractedAt: string;
}

export interface QASetWithMessages {
  id: string;
  title: string | null;
  summary: string | null;
  creatorId: string;
  creator: {
    id: string;
    name: string | null;
    image: string | null;
    trustLevel: number;
    hubScore?: number | null;
    authorityScore?: number;
  };
  parentQASetId: string | null;
  parentMessageCount: number;
  parentQASet?: {
    id: string;
    title: string | null;
    creator: { id: string; name: string | null; authorityScore?: number };
  } | null;
  isShared: boolean;
  sharedAt: Date | null;
  knowledgeCard: string | null;
  topicClusterId: string | null;
  topicCluster?: { id: string; name: string } | null;
  totalInvested: number;
  investorCount: number;
  negativeInvested: number;
  negativeCount: number;
  negativePool: number;
  authorityScore: number;
  qualityPool: number;
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages: MessageData[];
  tags: { tag: { id: string; name: string; slug: string } }[];
  investments?: InvestmentData[];
}

export interface MessageData {
  id: string;
  qaSetId: string;
  role: "user" | "assistant" | "system";
  content: string;
  originalContent: string | null;
  isImproved: boolean;
  improvedById: string | null;
  improvementNote: string | null;
  orderIndex: number;
  createdAt: Date;
  // Insight detection
  isInsight: boolean;
  insightReason: string | null;
  // Gap response
  isGapResponse: boolean;
  gapQuestionId: string | null;
  // Human-authored answer tracking
  isHumanAuthored: boolean;
  authorUserId: string | null;
  // 후속 질문 관계 라벨
  relationSimple: string | null;  // 간단 7종 배지
  relationQ1Q2: string | null;    // 전문가: 질문 전개 유형
  relationA1Q2: string | null;    // 전문가: 대답 트리거 유형
  relationStance: string | null;  // 입장: 수용|중립|도전
}

export interface ScoreDetail {
  total: number;      // 종합 점수 (0~100)
  relevance: number;  // 관련성 점수 (0~100)
  invest: number;     // 투자 점수 (0~100)
  text: number;       // 텍스트 매칭 (0~100)
  vector: number;     // 벡터 유사도 (0~100)
}

export interface QASetCardData {
  id: string;
  title: string | null;
  summary: string | null;
  creator: {
    id: string;
    name: string | null;
    image: string | null;
  };
  totalInvested: number;
  investorCount: number;
  authorityScore?: number;
  qualityPool?: number;
  viewCount: number;
  createdAt: Date;
  tags: { tag: { name: string } }[];
  _count?: { messages: number };
  messages?: { role: string; content: string }[];
  scoreDetail?: ScoreDetail;
}

export interface GraphNode {
  id: string;
  type: "qaset" | "opinion";
  label: string;
  data: QASetCardData | OpinionNodeData;
  position?: { x: number; y: number };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationType: string;
  customLabel?: string;
  isAIGenerated: boolean;
  isUserModified: boolean;
}

export interface OpinionNodeData {
  id: string;
  content: string;
  userId: string;
  user?: {
    name: string | null;
    image: string | null;
  };
  createdAt: Date;
}
