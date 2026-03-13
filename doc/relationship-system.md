# 관계 시스템 (Relationship System)

## 4-Level 구조

```
Level 0: Message (개별 Q/A 메시지)
   ↓ relationSimple (7종 담화 관계)
Level 1: QASet → NodeRelation (13종 지식 단위 관계)
   ↓ embedding similarity ≥ 0.70
Level 2: TopicCluster (주제 클러스터)
   ↓ KNOWLEDGE_TO_CLUSTER_MAP 집계
Level 3: ClusterRelation (4종 SKOS 관계)
```

## Level 0: Message 관계

AI 챗 응답에서 `[[REL:{...}]]` 태그로 자동 추출.

### 담화 관계 7종 (relationSimple)
| 값 | 한국어 | 설명 |
|----|--------|------|
| 명확화 | Clarification | 이전 답변을 더 명확하게 |
| 더깊게 | Deepening | 더 깊이 파고듦 |
| 근거 | Evidence | 근거 제시 |
| 검증 | Verification | 사실 확인 |
| 반박 | Counterargument | 반대 논점 |
| 적용 | Application | 실제 적용 사례 |
| 정리 | Synthesis | 종합 정리 |

### 추가 필드
- `relationQ1Q2`: Q1→Q2 질문 전개 유형 (전문가용)
- `relationA1Q2`: A1→Q2 답변 트리거 유형 (전문가용)
- `relationStance`: 입장 (수용 / 중립 / 도전)

## Level 1: NodeRelation (13종)

QASet 또는 OpinionNode 간 관계. `auto-linker.ts`에서 자동 생성 (유사도 ≥ 0.65).

### 담화 관계 (7종, RST/Toulmin)
clarification, deepening, evidence, verification, counterargument, application, synthesis

### 구조 관계 (6종, SKOS/온톨로지)
generalization, specialization, analogy, cause_effect, prerequisite, extension

## Level 2: TopicCluster

`clustering.ts`에서 embedding 코사인 유사도 ≥ 0.70 기준으로 QASet 배정.
- centroidEmbedding: 멤버 임베딩 평균
- synthesisText: AI 생성 종합 텍스트
- KnowledgeGap: 지식 갭 추적

## Level 3: ClusterRelation (SKOS 4종)

`cluster-relations.ts`에서 Level 1 관계를 집계하여 생성.

| 값 | 한국어 | 매핑되는 Level 1 관계 |
|----|--------|----------------------|
| broader (상위) | ↑ | synthesis, generalization, prerequisite |
| narrower (하위) | ↓ | deepening, application, specialization, extension |
| related (관련) | → | clarification, evidence, verification, analogy, cause_effect |
| conflicting (대립) | ← | counterargument |

## 파싱 흐름

```
AI 응답 → [[REL:{simple:"명확화", stance:"수용", q1q2:"...", a1q2:"..."}]]
  → relation-parser.ts에서 정규식 파싱
  → SIMPLE_TO_KEY로 한국어→영어 변환
  → Message.relationSimple에 저장
```

⚠️ 현재 정규식 파싱은 불안정 — tool_use 전환 권장 (technical-risks.md 참조)
