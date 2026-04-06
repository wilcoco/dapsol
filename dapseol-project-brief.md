# 답설(踏雪) — Project Brief for Development

> 이 문서는 Claude와의 대화에서 도출된 컨셉, 아키텍처, UX 설계, 비즈니스 모델을 정리한 프로젝트 브리프입니다.
> Claude Code(CLI)에서 개발 시작 시 컨텍스트로 사용합니다.

---

## 1. 프로젝트 개요

### 한 줄 정의
AI 대화(ChatGPT, Claude, Gemini 등)를 공유하고 큐레이션하는 신뢰 기반 플랫폼.

### 핵심 메타포: 눈 위의 발자국(踏雪)
- 사용자가 AI 대화를 공유하면 "발자국"이 찍힘
- 다른 사용자가 그 대화를 읽고 가치를 인정하면 발자국이 깊어짐
- 발자국이 모이면 "길(trail)"이 됨
- 길이 존재한다는 것 자체가 "이 콘텐츠는 가치있다"는 증명
- 아무도 선언하지 않았는데 걸어간 사람들의 흔적이 모여서 길이 됨

### 비전 (장기)
답설의 신뢰 레이어(LTN)를 인터넷의 신뢰 인프라로 확장.
Stripe이 결제 인프라인 것처럼, 답설은 신뢰 인프라가 되는 것이 목표.

---

## 2. 핵심 개념: Local Trust Network (LTN)

### 2.1 설계 철학

AI 신경망의 노드-링크 구조와 블록체인의 분산 원장 구조의 유사성에서 출발.
두 구조를 결합하되, 기존 블록체인의 약점(양자 취약성, 에너지 소비, 중앙화 경향)을 극복하는 새로운 신뢰 모델.

**핵심 원칙: "수첩은 내가 갖고, 배지만 보여주고, 경비견이 지킨다."**

- 기존 블록체인 = 공공 게시판에 모든 기록 공개
- LTN = 각자 개인 수첩(Trust Vault)을 보유, 필요시 증명(ZKP)만 교환

### 2.2 역사적 선례

LTN은 새로운 발명이 아니라, 검증된 모델의 디지털 업그레이드:

**하와라(Hawala) — 8세기 아라비아 상인 신용 거래**
- 각 중개인이 자체 장부 보관 (= Trust Vault)
- 평판이 전부, 한번 속이면 네트워크에서 퇴출 (= trust weight)
- 소개/보증 시스템 (= cold start 해결)
- 중앙 권위 없음 (= P2P)
- 1,200년 생존 — 은행, 제국, 화폐가 바뀌어도 살아남음

**쿨라 링(Kula Ring) — 파푸아뉴기니**
- 교환 행위 자체가 가치 (= Trust Receipt)
- 조개의 경제적 가치는 없지만, "이 조개가 내 손을 거쳤다"는 사실이 사회적 신뢰를 증명

**탤리 스틱(Tally Stick) — 중세 영국**
- 거래 기록이 곧 양도 가능한 신용 증서
- 나뭇결 매칭으로 위조 불가능 (= 영지식 증명의 원시 형태)

### 2.3 아키텍처 레이어

```
┌─────────────────────────────────────────────┐
│          Surfaces (Apps)                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│  │  답설     │ │  Taste    │ │  Future   │  │
│  │  (AI대화) │ │  (맛집등) │ │  Surface  │  │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘  │
├────────┴─────────────┴─────────────┴────────┤
│          Trust Layer (LTN)                   │
│  Trust Vault + AI Guard + ZKP Generator      │
├─────────────────────────────────────────────┤
│          User's Local Device                 │
│  Secure Enclave / TEE                        │
└─────────────────────────────────────────────┘
```

### 2.4 Trust Vault 구조

```json
{
  "identity": {
    "bio_auth_hash": "...",
    "device_key": "..."
  },
  "trust_graph": {
    "user_B": {
      "weight": 0.87,
      "history": ["receipt_001", "receipt_002"],
      "last_verified": "2025-03-15T10:30:00Z"
    },
    "user_C": {
      "weight": 0.42,
      "history": ["receipt_003"],
      "last_verified": "2025-03-10T14:20:00Z"
    }
  },
  "proof_cache": {},
  "ai_model_params": {}
}
```

### 2.5 AI Trust Engine (면역 체계 모델)

AI는 "판사"가 아니라 "경비견" — 신뢰를 판정하지 않고, 이상을 감지함.

**역할 3가지:**
1. **패턴 학습** — 사용자의 거래 패턴(빈도, 시간대, 상대방 분포) 학습. 기기 내에서만 실행.
2. **이상 탐지** — "이건 주인의 패턴이 아니다" 감지. 양자컴퓨터로 암호를 깨도 행동 패턴은 복제 불가.
3. **대응** — 정상: 자동 승인 / 의심: 생체인증 추가 요구 / 명백한 이상: 차단+알림

**신뢰 판단은 전적으로 사용자 몫. AI는 그 과정이 변조 없이 이루어지는지만 감시.**

### 2.6 ZKP (Zero-Knowledge Proof) 기반 인증

```
[User A Local]        [Relay Network]        [User B Local]

Trust Vault 보관         ×                Trust Vault 보관
(오프라인 유지)                           (오프라인 유지)
     │                                        │
     ├── 인증 요청 ────→ 중계만 ────→          │
     │                                        │
     │          ←── ZKP 기반 신뢰 증명 ────────┤
     │                                        │
로컬에서 검증 완료        ×              로컬에서 증명 생성
(원본 데이터 비노출)                    (원본 데이터 비노출)
```

**양자 내성 확보 원리:**
- 공격 표면 분산: 개별 기기 공격 필요 (네트워크 일괄 공격 불가)
- 오프라인 보호: 네트워크 미연결 시 암호학적 공격 자체 불가
- 키 비노출: 신뢰 데이터가 네트워크를 한 번도 통과하지 않음
- 양자내성 알고리즘(CRYSTALS-Dilithium 등)으로 ZKP 자체 서명 → 이중 방어

### 2.7 Trust Receipt (거래 성사 = 신뢰 징표)

**성공적 신뢰 교환 시 자동 생성되는 영수증:**

```json
{
  "receipt_id": "tr_20250315_a7b3",
  "timestamp": "2025-03-15T10:30:00Z",
  "parties_trust_level": [7, 8],
  "type": "ai_curation_validation",
  "cryptographic_proof": "..."
}
```

**특징:**
- 누구인지, 뭘 거래했는지는 기록하지 않음
- "신뢰도 N인 사람과 신뢰도 M인 사람이 성공적으로 교환함"만 기록
- 영수증이 쌓일수록 자기 신뢰 증폭 (복리 효과)
- 콜드 스타트 해결에 활용 가능 (다른 네트워크 영수증 이식)
- 네트워크 건강 지표 역할

---

## 3. Cold Start 해결 전략

새 사용자가 신뢰 0에서 시작하는 문제의 3가지 경로:

### Path A: 소개 (Introduction)
- 기존 사용자가 신규 사용자를 보증
- 보증인의 신뢰도에 비례하여 초기 trust seed 부여
- 예: 신뢰 9/10인 준이 소개 → 3/10에서 시작 / 신뢰 4/10인 서가 소개 → 1/10에서 시작

### Path B: 작은 것부터 (Small Steps)
- 소개 없이 직접 참여
- 좋은 AI 대화 하나 공유 → 누군가 가치 인정 → 첫 Trust Receipt 발행
- 0 → 1 → 2 → 3 점진적 성장

### Path C: 평판 이식 (Reputation Seed)
- 다른 네트워크에서 쌓은 Trust Receipt를 포터블하게 가져옴
- ZKP로 "나는 저기서 이만큼 신뢰받았다" 증명 (상세 노출 없이)

---

## 4. UX 설계

### 4.1 핵심 원칙

**사용자는 "신뢰", "영수증", "ZKP" 같은 기술 용어를 한 번도 보지 않아야 한다.**

기술 용어 → 사용자 언어 매핑:

| 기술 용어 | 사용자가 보는 것 |
|-----------|-----------------|
| Trust Receipt 발행 | "Walk this trail" 버튼 |
| 큐레이터 신뢰 가중치 증가 | Trail depth: 142 → 143 |
| 내 Trust Vault에 기록 추가 | Your trail sense: 12 → 13 |
| 누적 영수증 기반 등급 | Deep trail / Warm trail / Fresh snow |
| 신뢰 원장의 시각화 | Trail map (풍경형 막대 차트) |
| 행동 패턴 기반 취향 매칭 | Taste match 94% |

### 4.2 UI 상태 체계

**Trail 상태 (콘텐츠 기준):**
- `Deep trail` (Coral 색상) — 많은 walkers가 검증한 콘텐츠
- `Warm trail` (Teal 색상) — 일정 수의 walkers가 검증한 콘텐츠
- `Fresh snow` (Gray 색상) — 새로 공유된, 아직 검증되지 않은 콘텐츠

**숫자 점수 대신 풍경:** 프로필에 "신뢰도 87점" 대신 Trail map(풍경형 막대 차트) 표시.
숫자는 비교와 경쟁을 만들지만, 풍경은 느낌을 만든다.

### 4.3 주요 화면

**Discovery Feed (Trails)**
- 콘텐츠 목록 with trail depth 표시
- 왼쪽 border color로 상태 구분 (Deep/Warm/Fresh)
- 각 항목에 trail dots (깊이 시각화)
- walker 수 표시

**Conversation Reader**
- AI 대화 내용 표시
- 하단에 "Walk this trail" / "Not for me" 선택
- Walk 시 양쪽 모두에게 Trust Receipt 발행 (UI에서는 "Footprint added" 표시)
- 큐레이터의 trail depth 증가 + 내 trail sense 증가 동시 표시

**Curator Profile**
- Trail map (풍경형 막대 차트)
- Trails shared 수, Total walkers 수, Trail sense
- 막대 높이 = walker 수, 색상 = 깊이(Deep/Warm/Fresh)

**New User Onboarding**
- "Fresh snow" 상태로 시작 (빈 프로필이 아닌 가능성의 이미지)
- 3가지 시작 경로 안내: Walk / Share / Get introduced

### 4.4 맛집 추천 확장 시 UX

**핵심: "이 식당이 좋은가?"가 아니라 "나와 입맛이 맞는 사람이 추천한 곳인가?"**

- `taste match %` 표시 — Trust Receipt 누적으로 자연 형성
- 같은 식당이 사용자 A에겐 Deep trail이고 사용자 B에겐 Different taste일 수 있음
- 알고리즘이 아닌 실제 검증(직접 가서 먹고 확인)의 누적으로 taste tribe 형성

**유통되는 4가지 비화폐 가치:**
1. 시간 — 검색 없이 신뢰하는 사람의 추천으로 결정
2. 취향 정렬 — "평균적으로 좋은" 대신 "나에게 좋은"
3. 발견 — 검색으로 못 찾는, 신뢰 네트워크로만 접근 가능한 곳
4. 확신 — 불안 없이 문을 여는 심리적 안정감

---

## 5. 비즈니스 모델

### 5.1 규제 회피 전략

**절대 하지 않는 것:**
- Trail sense를 현금 교환 가능하게 만들기 (→ 특금법/FinCEN)
- Trail sense를 거래소에서 거래 (→ 증권법/SEC/MiCA)
- Trail sense로 실소득 발생 (→ 세금 문제)

**핵심 원칙: "평판은 돈으로 살 수 없을 때 가장 강력하다."**
- 미슐랭 스타를 살 수 있으면 미슐랭 가치 = 0
- Stack Overflow karma를 팔 수 없지만 실리콘밸리 취업에 실제 힘 발휘
- Trail sense = reputation → access, never → money

### 5.2 수익 모델

| Revenue Stream | 설명 |
|---------------|------|
| Premium 구독 | 고급 검색, 분석, 내보내기 기능 |
| Enterprise/API | 기업 내부 AI 지식 큐레이션 |
| Sponsored Trails | AI 회사들의 use case 프로모션 |
| Education 파트너십 | 대학, 부트캠프 연계 |

**플랫폼이 돈을 벌고, 사용자는 평판을 번다. 이 둘은 절대 섞이지 않는다.**

### 5.3 Trail Sense의 간접적 실세계 가치

Trail sense가 높으면:
- Early access (새 기능, 베타)
- Visibility (콘텐츠 노출 우선)
- Curation power (컬렉션 생성, 큐레이터 초대)
- 간접적으로: 고용주 주목, 팔로워 성장, 네트워크 확장

---

## 6. 기술 스택 (권장)

### Phase 1 구현 범위

답설 MVP + 신뢰 레이어 기초 (분리 가능 아키텍처):

| 영역 | 기술 | 비고 |
|------|------|------|
| Frontend | React/Next.js 또는 React Native | 모바일 우선 |
| Backend | Node.js 또는 Python (FastAPI) | |
| Database | PostgreSQL + Redis | 메타데이터 + 캐시 |
| Local Trust | IndexedDB / SQLite (모바일) | Trust Vault 저장 |
| ZKP | snarkjs + circom | 영지식 증명 |
| PQ Crypto | liboqs (Open Quantum Safe) | 양자내성 암호 |
| AI (경량) | TensorFlow Lite / ONNX Runtime | 로컬 이상 탐지 |
| Auth | 생체인증 (WebAuthn/FIDO2) | 비밀번호 없음 |

### 아키텍처 원칙

1. **Trust Layer 분리**: 신뢰 관련 모듈은 답설 앱 로직과 분리된 독립 모듈로 설계
2. **Local-first**: 핵심 신뢰 데이터는 항상 로컬에 원본, 서버는 중계/검색만
3. **점진적 구현**: Phase 1에서는 Trust Vault + 기본 신뢰 교환, ZKP와 AI guard는 Phase 2+

### 디렉토리 구조 (제안)

```
dapseol/
├── apps/
│   ├── web/              # Next.js 웹앱 (답설 Surface)
│   └── mobile/           # React Native (향후)
├── packages/
│   ├── trust-core/       # Trust Vault, Trust Receipt 로직
│   ├── trust-ai/         # AI Trust Engine (이상 탐지)
│   ├── trust-zkp/        # ZKP Generator / Verifier
│   ├── trust-crypto/     # PQ 암호화 레이어
│   └── shared/           # 공유 타입, 유틸리티
├── services/
│   ├── relay/            # 중계 서버 (ZKP 전달만)
│   └── search/           # 콘텐츠 검색/인덱싱
└── docs/
    └── architecture.md
```

---

## 7. 개발 로드맵

### Phase 1: MVP (지금)
- [ ] 답설 웹앱 기본 구조
- [ ] AI 대화 공유 기능 (ChatGPT, Claude, Gemini 링크/텍스트)
- [ ] Trust Vault 로컬 저장 (IndexedDB 기반, 추후 마이그레이션 가능)
- [ ] "Walk this trail" 기본 인터랙션 (Trust Receipt의 단순 버전)
- [ ] Discovery feed (trail depth 기반 정렬)
- [ ] Curator profile (Trail map)
- [ ] 기본 cold start: Path B (작은 것부터)

### Phase 2: 신뢰 강화
- [ ] ZKP 기반 인증 도입
- [ ] AI Trust Engine (로컬 이상 탐지)
- [ ] 생체인증 통합 (WebAuthn)
- [ ] Cold start Path A (소개/보증)
- [ ] Taste tribe 자동 형성

### Phase 3: 표면 확장
- [ ] 추천 탭 추가 (맛집, 책, 도구)
- [ ] Taste match % 기능
- [ ] Cold start Path C (평판 이식)
- [ ] Premium 구독 모델

### Phase 4: 플랫폼
- [ ] Trust Layer 프로토콜 오픈
- [ ] "Sign in with 답설 Trust" API
- [ ] Third-party surface 지원
- [ ] Enterprise API

---

## 8. 핵심 설계 결정 요약

| 결정 | 선택 | 근거 |
|------|------|------|
| 신뢰 저장 위치 | 로컬 (사용자 기기) | 양자 내성, 프라이버시, 하와라 모델 |
| AI 역할 | 경비견 (이상 탐지) | 판사 모델은 중앙화로 회귀 |
| 가치 교환 | 비화폐 (reputation → access) | 규제 회피 + 역설적으로 더 높은 가치 |
| 맛집 등 확장 | 층 분리 (shared trust, separate surfaces) | 분리는 신뢰 낭비, 통합은 정체성 혼란 |
| 사용자 언어 | 기술 용어 제거 (trail, footprint, walk) | 직관적 이해가 채택의 핵심 |
| 수치 표현 | 숫자 점수 대신 풍경(landscape) | 경쟁 대신 느낌, 비교 대신 고유성 |
| 개발 순서 | 답설 먼저, trust layer 분리 가능하게 | 하나에 집중하되 확장 준비 |

---

## 9. 참고: 기존 유사 서비스와의 차별점

| 서비스 | 접근 | 답설과의 차이 |
|--------|------|-------------|
| Steemit/BitClout | 평판 토큰화 | 답설: 평판은 비화폐, 규제 없음 |
| Stack Overflow | 중앙 karma 시스템 | 답설: 로컬 신뢰, 탈중앙 |
| Google Reviews | 익명 별점 평균 | 답설: 취향 매칭 기반 개인화 추천 |
| Yelp | 중앙 리뷰 플랫폼 | 답설: 신뢰는 사용자 소유, 이식 가능 |
| SingularityNET | AI + 블록체인 거래 | 답설: 블록체인 불필요, 로컬 신뢰 |

---

*이 문서는 답설 프로젝트의 현재까지 정리된 컨셉입니다. Claude Code에서 개발 시 이 문서를 컨텍스트로 제공하면, 아키텍처와 설계 의도를 유지하며 코딩을 진행할 수 있습니다.*
