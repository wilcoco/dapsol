# 개발 계획 (Development Plan)

## 원칙

1. **문서 우선**: 모든 변경 전 `/doc` 업데이트, 변경 후 반영
2. **점진적 리팩토링**: 기존 기능 유지하면서 구조 개선
3. **테스트 선행**: 핵심 로직 테스트 작성 후 리팩토링
4. **단일 책임**: 라우트 핸들러는 HTTP만, 비즈니스 로직은 서비스 레이어

## Phase 0: 기반 정비 ✅

- [x] `/doc` 문서 7개 생성
- [x] `@ai-sdk/anthropic`, `reactflow` 미사용 패키지 제거
- [x] `src/middleware.ts` — 인증 경로 보호 + 보안 헤더
- [x] `src/lib/api-response.ts` — 표준 응답 헬퍼 6종

## Phase 1: 핵심 안정화 ✅

- [x] `investment.service.ts` — invest route 959줄 → 38줄 + 서비스 분리
- [x] 경제 시스템 테스트 45개 (reward-calculator, hits, trust-level, uninvestment, collapse-threshold)
- [x] `BackgroundJob` 모델 + PostgreSQL 기반 영속 잡 큐
- [x] share route에서 영속 큐 사용, stale job 복구 기능

## Phase 2: 검색 & AI 개선 ✅

- [x] `[[REL:{...}]]` 정규식 → Anthropic `tool_use` (tag_relation) 전환
- [x] `vectorSearch()` SQL 버그 수정, `checkPgvectorStatus()` 추가
- [x] health check에 pgvector 상태 + pending jobs 표시
- [x] `session-cache.ts` — 인메모리 TTL 캐시 (5분), 잔액 변경 시 무효화

## Phase 3: UX 리디자인 ✅ (기반 완료)

- [x] 4탭 문명 메타포 전환: 🏠 영토, ✨ 개척, 🗺️ 지도, 👤 나
- [x] 탐색 잠금 해제 로직 제거 (온보딩 없이 바로 접근)
- [x] 랜딩 페이지 문명 메타포 적용 (개척/경작/탐험)
- [x] session 갱신 주기 30초 → 60초 (캐시 도입으로)
- [x] `/api/activity-feed` — 실시간 활동 피드 API
- [x] QASet 스키마에 `canonicalStatus` + `canonicalParentId` 추가

### 남은 Phase 3 작업
- [x] 활동 피드 프론트엔드 컴포넌트 (홈 탭 상단) — `ActivityFeed` 컴포넌트
- [x] 미니맵 컴포넌트 (홈 탭) — `MiniMap` 컴포넌트 (클러스터 기반)
- [x] 전체 UI 텍스트 메타포 일괄 적용 (투자→경작, 공유→영토 공개, 추천→경작, 공유됨→공개됨)
- [x] 🤖→👤 시그니처 아이콘 적용 — answer-gaps 헤더
- [x] Canonical Q&A 중복 감지/병합 API — `/api/qa-sets/[id]/canonical` (GET: 유사도 검색, POST: 상태 변경)

## Phase 4: 고급 기능 ✅ (핵심 완료)

### 4-1. 모니터링
- [ ] Sentry 연동 (실제 계정 필요)
- [x] 경제 시스템 건전성 메트릭 대시보드 — `/api/admin/metrics` (경제, 사용자, 콘텐츠, 24시간 활동, 신뢰 레벨 분포)
- [x] LLM API 호출 추적 — `llm-tracker.ts` (인메모리, provider/purpose별 통계, chat route 연동)

### 4-2. 반조작 강화
- [x] 상호 경작 감지 → 실제 차단 — `detectMutualInvestment()` (이미 invest 서비스에 통합됨)
- [x] 사냥 급증 감지 알림 — `hunt-surge.ts` (windowHours 내 minHunts 이상 감지, metrics API에 포함)

### 4-3. 알림 시스템
- [x] 실시간 알림 (SSE) — `/api/notifications/stream` + `sse-emitter.ts` + NotificationBell SSE 연동
- [ ] 알림 설정 (종류별 on/off) — 추후 사용자 설정 UI 추가 시

## 배포 체크리스트

Railway 환경변수:
- [x] DATABASE_URL
- [ ] DIRECT_DATABASE_URL (DATABASE_URL과 동일 값)
- [x] AUTH_SECRET (32자 이상)
- [ ] NEXTAUTH_URL (`https://qaqa-production.up.railway.app`)
- [ ] ANTHROPIC_API_KEY
- [x] OPENAI_API_KEY (공백 없이)

배포 후 필수 확인:
- `prisma db push` 시 BackgroundJob, canonicalStatus 컬럼 생성 확인
- `/api/health` → pgvector 상태 확인
