# 아키텍처 (Architecture)

## 기술 스택

| 영역 | 기술 | 버전/비고 |
|------|------|-----------|
| 프레임워크 | Next.js (App Router) | 16.x |
| 언어 | TypeScript | strict mode |
| 스타일링 | TailwindCSS v4 + shadcn/ui | radix-ui 기반 |
| ORM | Prisma | PostgreSQL provider |
| DB | PostgreSQL + pgvector | Railway 호스팅 |
| 인증 | NextAuth v5 beta | JWT 전략, Credentials + GitHub OAuth |
| AI Chat | @anthropic-ai/sdk | claude-sonnet-4-20250514, 직접 스트리밍 |
| 임베딩 | OpenAI text-embedding-3-small | 1536차원 |
| 배포 | Railway | Nixpacks 빌더 |

## 디렉토리 구조

```
src/
├── app/
│   ├── api/                    # 36개 API 라우트
│   │   ├── auth/[...nextauth]/ # NextAuth 핸들러
│   │   ├── chat/               # AI 스트리밍 챗
│   │   ├── qa-sets/            # CRUD, 검색, 공유, 투자, 분기, 확장
│   │   │   └── [id]/
│   │   │       ├── invest/     # 경작/사냥 (959줄 ⚠️)
│   │   │       ├── share/      # 공유 + 백그라운드 잡 트리거
│   │   │       ├── fork/       # 분기
│   │   │       └── extend/     # 확장
│   │   ├── graph/              # 지식 그래프 데이터
│   │   ├── clusters/           # 클러스터 관리
│   │   ├── investments/        # 투자 관리
│   │   ├── hits/               # HITS 점수 재계산
│   │   ├── decay/              # 점수 감쇠
│   │   ├── health/             # 헬스체크
│   │   └── debug/              # 환경변수 디버그
│   ├── login/                  # 로그인 페이지
│   └── page.tsx                # 메인 SPA (3섹션 탭)
├── components/
│   ├── section1/               # 검색 + 질문 입력
│   ├── section2/               # Q&A 워크스페이스
│   ├── section3/               # 지식 그래프 (SVG)
│   ├── section5/               # 탐색 가능 지식 지도
│   └── ui/                     # shadcn/ui 컴포넌트
├── lib/
│   ├── engine/                 # 경제 시스템 엔진
│   │   ├── reward-calculator.ts   # 50/40/10 분배
│   │   ├── hits.ts                # Authority + Hub 점수
│   │   ├── decay.ts               # 시간 기반 감쇠
│   │   ├── trust-level.ts         # 5단계 신뢰 등급
│   │   ├── anti-gaming.ts         # 반조작 검사
│   │   ├── hunt-verification.ts   # 사냥 AI 검증
│   │   ├── collapse-threshold.ts  # 붕괴 임계값
│   │   └── uninvestment.ts        # 철수 로직
│   ├── search/                 # 검색 시스템
│   │   ├── embedding.ts           # 벡터 검색 (pgvector)
│   │   ├── query-expander.ts      # AI 쿼리 확장
│   │   └── scoring.ts             # 통합 스코어링
│   ├── knowledge/              # 지식 시스템
│   │   ├── clustering.ts          # 클러스터 배정 (코사인 0.70)
│   │   ├── cluster-relations.ts   # 레벨1→2 관계 집계
│   │   ├── auto-linker.ts         # 자동 링크 (유사도 0.65)
│   │   └── knowledge-card.ts      # 지식카드 추출
│   ├── chat/                   # 챗 관련
│   │   ├── rag-context.ts         # RAG 컨텍스트 구성
│   │   └── relation-parser.ts     # [[REL:{...}]] 파싱
│   ├── background/
│   │   └── job-queue.ts           # 인메모리 잡 큐 ⚠️
│   ├── auth.ts                 # NextAuth 설정 (JWT-only)
│   ├── prisma.ts               # Prisma 클라이언트
│   ├── constants.ts            # 관계 타입, 사냥 사유
│   └── rate-limit.ts           # 인메모리 레이트 리미팅
└── prisma/
    └── schema.prisma           # 22개 모델
```

## 데이터 모델 (22 models)

### 핵심 모델
- **User**: 잔액, trustLevel, hubScore, authorityScore
- **QASet**: 멀티턴 Q&A 컨테이너, 분기 트리(parentQASetId), 공유 상태, 투자 메트릭, embedding, knowledgeCard, version(낙관적 동시성)
- **Message**: Q/A 개별 메시지, 관계 라벨(relationSimple 7종 + Q1Q2/A1Q2/Stance)
- **Investment**: position 기반 투자, isNegative(사냥), effectiveAmount, 사냥 근거
- **RewardEvent**: 투자 보상 이벤트 로그

### 지식 시스템
- **TopicCluster**: QASet 그룹, centroidEmbedding, synthesisText
- **ClusterRelation**: 클러스터 간 관계 (SKOS 기반 4종)
- **NodeRelation**: QASet/OpinionNode 간 관계 (13종)
- **KnowledgeGap**: AI가 감지한 지식 갭
- **KnowledgeEvolutionEvent**: 지식 진화 이벤트
- **UserTopicContribution**: 주제별 사용자 기여도
- **OpinionNode**: 사용자 의견 노드

### 인프라
- **AuditLog**: append-only 감사 로그
- **Notification**: 알림
- **Tag / QASetTag**: 태그 시스템
- **Account / Session / VerificationToken**: NextAuth

## 2-Level 관계 시스템

### 레벨 1: 지식 단위 관계 (13종)
담화 관계 (RST/Toulmin): 명확화, 심화, 근거, 검증, 반박, 적용, 정리
구조 관계 (SKOS/온톨로지): 일반화, 구체화, 유추, 인과관계, 선행조건, 확장

### 레벨 2: 주제 영역 관계 (SKOS 4종)
상위(broader), 하위(narrower), 관련(related), 대립(conflicting)

레벨1→레벨2 매핑: `KNOWLEDGE_TO_CLUSTER_MAP` (constants.ts)

## API 라우트 (36개)

비즈니스 로직이 라우트 핸들러에 직접 구현됨 (서비스 레이어 없음 ⚠️).
가장 큰 핸들러: `qa-sets/[id]/invest/route.ts` (959줄).

## 인증 흐름

1. NextAuth v5 + JWT 전략 (PrismaAdapter 사용하지 않음)
2. Credentials 프로바이더: 이름 입력 → `name@demo.local` 이메일 자동 생성 → DB 유저 생성/조회
3. Session 콜백: 매 요청마다 DB에서 balance/hubScore/authorityScore 조회 (N+1 문제 ⚠️)
4. GitHub OAuth 지원 (AUTH_GITHUB_ID/SECRET 설정 시)

## 배포 (Railway)

```toml
[build]
buildCommand = "npm install && npx prisma generate && npm run build"

[deploy]
startCommand = "npx prisma db push --skip-generate && npm start"
healthcheckPath = "/api/health"
```

환경변수: DATABASE_URL, DIRECT_DATABASE_URL, AUTH_SECRET, NEXTAUTH_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY
