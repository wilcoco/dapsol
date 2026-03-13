# 경제 시스템 (Economic System)

## 개요

신뢰 포인트(Trust Point) 기반 경제 시스템. 사용자가 Q&A에 투자하고, 좋은 Q&A를 먼저 발굴한 사람이 보상받는 구조.

## 핵심 파라미터

| 파라미터 | 값 | 위치 |
|----------|-----|------|
| 초기 잔액 | 10,000 포인트 | `constants.ts: INITIAL_BALANCE` |
| 품질 풀 비율 | 50% | `reward-calculator.ts: POOL_RATIO` |
| 선투자자 보상 비율 | 40% | `reward-calculator.ts: REWARD_RATIO` |
| 소각 비율 | 10% | `reward-calculator.ts: BURN_RATIO` |
| 보상 상한 | 원금 × 2 | `reward-calculator.ts: REWARD_CAP_MULTIPLIER` |
| 클러스터 유사도 임계값 | 0.70 | `clustering.ts` |
| 자동 링크 유사도 임계값 | 0.65 | `auto-linker.ts` |

## 투자 분배 흐름

```
새 투자 100pt 발생
├── 50pt → 품질 풀 (QASet에 잠금)
│   └── 마일스톤(3명, 10명, 25명) 도달 시 지분 비례 해제
├── 40pt → 선투자자 보상
│   └── 실효 지분 = sqrt(투자금) × hubScore
│   └── 보상 상한: 누적 보상 ≤ 원금 × 2
└── 10pt → 소각 (총 공급량 감소)
```

## 실효 지분 (Effective Weight)

```
effectiveWeight = sqrt(amount) × hubScore
```

- `sqrt(amount)`: 고래 방지 — 큰 투자의 한계효용 감소
- `hubScore`: 안목 가중 — 좋은 투자 이력이 있는 사용자 우대

## 마일스톤 해제

| 투자자 수 | 해제 비율 |
|-----------|-----------|
| 3명 | 풀의 20% |
| 10명 | 남은 풀의 30% |
| 25명 | 남은 풀의 50% |

해제된 금액은 **모든 지분 보유자** (창작자 포함)에게 실효 지분 비례 분배.

## HITS 점수

### Authority Score (창작 권위)
```
authorityScore = 100 + 50 × log₂(1 + avgExternalInvestment / 100)
```
- 자신이 만든 Q&A에 대한 외부 투자 평균
- 높을수록: 좋은 콘텐츠를 만드는 사람

### Hub Score (투자 안목)
```
hubScore = 1 + log₂(1 + avgAuthorityOfInvested / 100)
```
- 자신이 투자한 Q&A들의 authority 평균
- 높을수록: 좋은 Q&A를 먼저 찾는 사람

## 사냥 (Negative Investment)

오류 발견 시 부정 투자. `Investment.isNegative = true`.

### 사냥 사유 7종 (`constants.ts`)
환각, 정보만료, 사실오류, 뉘앙스누락, 출처불일치, 논리오류, 과도일반화

### AI 사전 검증 (`hunt-verification.ts`)
Claude Haiku로 사냥 근거가 답변 내용과 관련 있는지 검증.
관련 없으면 400 반환.

### 붕괴 조건 (`collapse-threshold.ts`)
```
negativeCount >= 3 AND negativeRatio > 0.6
```
사냥꾼 3명 이상 + 전체 투자자 중 60% 이상이 사냥일 때만 붕괴.

## 신뢰 등급 (Trust Level)

5단계 등급 시스템 (`trust-level.ts`). 활동 점수 기반.
각 등급별 최대 투자 한도 제한.

## 철수 (Uninvestment)

`uninvestment.ts`에서 처리. 이미 분배된 보상 회수 불가 — 원금에서 이미 배분된 비율만큼 차감 후 반환.

## 감사 로그 (Audit Log)

모든 경제 활동이 `AuditLog` 테이블에 기록됨:
invest, uninvest, share, hunt, reward, burn, milestone
