export const INITIAL_BALANCE = 10000;

// Trust levels are defined in src/lib/engine/trust-level.ts (activity-score based)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 레벨 1: 지식 단위 관계 (Knowledge Unit Relations)
// — Message 간 + QASet 간 모두 이 어휘 사용
// — 근거: RST(Mann&Thompson 1988), Toulmin(1958), SKOS(W3C), ConceptNet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const KNOWLEDGE_RELATION_TYPES = [
  // 담화 관계 (RST/Toulmin 기반)
  { value: "clarification", label: "명확화", labelEn: "Clarification", color: "#3b82f6" },
  { value: "deepening", label: "심화", labelEn: "Deepening", color: "#8b5cf6" },
  { value: "evidence", label: "근거", labelEn: "Evidence", color: "#22c55e" },
  { value: "verification", label: "검증", labelEn: "Verification", color: "#10b981" },
  { value: "counterargument", label: "반박", labelEn: "Counterargument", color: "#ef4444" },
  { value: "application", label: "적용", labelEn: "Application", color: "#14b8a6" },
  { value: "synthesis", label: "정리", labelEn: "Synthesis", color: "#6b7280" },
  // 구조 관계 (SKOS/온톨로지 기반)
  { value: "generalization", label: "일반화", labelEn: "Generalization", color: "#3b82f6" },
  { value: "specialization", label: "구체화", labelEn: "Specialization", color: "#8b5cf6" },
  { value: "analogy", label: "유추", labelEn: "Analogy", color: "#06b6d4" },
  { value: "cause_effect", label: "인과관계", labelEn: "Cause & Effect", color: "#f97316" },
  { value: "prerequisite", label: "선행조건", labelEn: "Prerequisite", color: "#6366f1" },
  { value: "extension", label: "확장", labelEn: "Extension", color: "#14b8a6" },
] as const;

export type KnowledgeRelationType = (typeof KNOWLEDGE_RELATION_TYPES)[number]["value"];

/** 레벨 1 라벨 조회 (이전 어휘 하위 호환 포함) */
export const KNOWLEDGE_RELATION_LABELS: Record<string, string> = {
  ...Object.fromEntries(KNOWLEDGE_RELATION_TYPES.map((t) => [t.value, t.label])),
  // 이전 어휘 → 새 라벨 매핑 (DB에 남아있을 수 있는 구 값)
  elaboration: "심화",
  contradiction: "반박",
  custom: "기타",
};

/** 레벨 1 색상 조회 (이전 어휘 하위 호환 포함) */
export const KNOWLEDGE_RELATION_COLORS: Record<string, string> = {
  ...Object.fromEntries(KNOWLEDGE_RELATION_TYPES.map((t) => [t.value, t.color])),
  elaboration: "#8b5cf6",
  contradiction: "#ef4444",
  custom: "#6b7280",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 레벨 2: 주제 영역 관계 (Topic Area Relations)
// — ClusterRelation 전용
// — 근거: SKOS(W3C 2009) broader/narrower/related + conflicting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const CLUSTER_RELATION_TYPES = [
  { value: "broader", label: "상위", labelEn: "Broader", direction: "up" as const, color: "#22c55e" },
  { value: "narrower", label: "하위", labelEn: "Narrower", direction: "down" as const, color: "#f97316" },
  { value: "related", label: "관련", labelEn: "Related", direction: "right" as const, color: "#3b82f6" },
  { value: "conflicting", label: "대립", labelEn: "Conflicting", direction: "left" as const, color: "#ef4444" },
] as const;

export type ClusterRelationType = (typeof CLUSTER_RELATION_TYPES)[number]["value"];

/** 레벨 2 라벨 조회 */
export const CLUSTER_RELATION_LABELS: Record<string, string> = Object.fromEntries(
  CLUSTER_RELATION_TYPES.map((t) => [t.value, t.label])
);

/** 레벨 2 색상 조회 */
export const CLUSTER_RELATION_COLORS: Record<string, string> = Object.fromEntries(
  CLUSTER_RELATION_TYPES.map((t) => [t.value, t.color])
);

/** 레벨 2 방향 매핑 */
export const CLUSTER_RELATION_DIRECTION: Record<string, string> = Object.fromEntries(
  CLUSTER_RELATION_TYPES.map((t) => [t.value, t.direction])
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 레벨 1 → 레벨 2 집계 매핑
// 지식 단위 관계들이 클러스터 레벨에서 어떤 관계로 집약되는지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const KNOWLEDGE_TO_CLUSTER_MAP: Record<string, ClusterRelationType> = {
  clarification: "related",
  deepening: "narrower",
  evidence: "related",
  verification: "related",
  counterargument: "conflicting",
  application: "narrower",
  synthesis: "broader",
  generalization: "broader",
  specialization: "narrower",
  analogy: "related",
  cause_effect: "related",
  prerequisite: "broader",
  extension: "narrower",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 하위 호환: 기존 코드가 RELATION_TYPES를 참조하는 경우 대비
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const RELATION_TYPES = KNOWLEDGE_RELATION_TYPES;
export type RelationType = KnowledgeRelationType;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 반대 사유 (Hunting Reason Types)
// — AI 답변의 문제를 발견했을 때 분류
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const HUNTING_REASON_TYPES = [
  { value: "hallucination", label: "환각", labelEn: "Hallucination", icon: "👻", description: "AI가 존재하지 않는 사실을 만들어냄" },
  { value: "outdated_info", label: "정보만료", labelEn: "Outdated Info", icon: "⏰", description: "더 이상 유효하지 않은 정보" },
  { value: "incorrect_fact", label: "사실오류", labelEn: "Incorrect Fact", icon: "❌", description: "확인 가능한 사실 관계가 틀림" },
  { value: "missing_nuance", label: "뉘앙스누락", labelEn: "Missing Nuance", icon: "🔍", description: "중요한 맥락이나 예외가 빠짐" },
  { value: "source_mismatch", label: "출처불일치", labelEn: "Source Mismatch", icon: "📎", description: "인용한 출처와 실제 내용이 다름" },
  { value: "logical_fallacy", label: "논리오류", labelEn: "Logical Fallacy", icon: "🧩", description: "논리적 추론에 오류가 있음" },
  { value: "overgeneralization", label: "과도일반화", labelEn: "Overgeneralization", icon: "🎯", description: "특수한 경우를 지나치게 일반화함" },
] as const;

export type HuntingReasonType = (typeof HUNTING_REASON_TYPES)[number]["value"];

/** 반대 사유 라벨 조회 */
export const HUNTING_REASON_LABELS: Record<string, string> = Object.fromEntries(
  HUNTING_REASON_TYPES.map((t) => [t.value, t.label])
);
