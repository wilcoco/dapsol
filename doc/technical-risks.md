# 기술적 리스크 (Technical Risks)

## CRITICAL

### 1. ~~인메모리 잡 큐~~ → PostgreSQL 잡 큐 ✅ 해결
**해결**: `BackgroundJob` 모델 + `pg-job-queue.ts` (PostgreSQL 기반 영속 큐)
- 서버 재시작 후 stale job 자동 복구 (`recoverStaleJobs()`)
- 의존성 순서 처리, 재시도 로직, 핸들러 등록 시스템

### 2. ~~서비스 레이어 부재~~ → 부분 해결 ✅
**해결**: `investment.service.ts` 추출 (invest route 959줄 → 38줄 + 서비스)
**남은 작업**: sharing, search 서비스도 추출 가능하나 현재 규모에서는 우선순위 낮음

### 3. ~~테스트 코드 제로~~ → 핵심 테스트 추가 ✅
**해결**: vitest + 45개 단위 테스트
- reward-calculator (18), hits (5), trust-level (11), uninvestment (4), collapse-threshold (6)
**남은 작업**: 통합 테스트, E2E 테스트 (Phase 4에서)

## HIGH

### 4. ~~Session DB 폴링~~ → 캐시 적용 ✅
**해결**: `session-cache.ts` 인메모리 TTL 캐시 (5분, 1000항목)
- 캐시 히트 시 DB 스킵, 잔액 변경 시 `invalidate()` 호출
- 세션 갱신 주기도 30초 → 60초로 완화

### 5. ~~AI JSON 파싱 불안정~~ → tool_use 전환 ✅
**해결**: Anthropic `tool_use` (tag_relation tool)로 전환
- 정규식 파싱 완전 제거, 구조화된 JSON으로 관계 데이터 수신
- `relation-parser.ts` 더 이상 미사용

### 6. ~~듀얼 AI SDK~~ → 부분 해결 ✅
**해결**: `@ai-sdk/anthropic` 제거
- `@anthropic-ai/sdk` (chat, keyword, hunt-verification)
- `@ai-sdk/openai` + `ai` (embedding 전용) — 유지 (Vercel AI SDK의 OpenAI embedding이 편리)

### 7. ~~듀얼 그래프 라이브러리~~ → 해결 ✅
**해결**: `reactflow` 제거 (미사용)

## MEDIUM

### 8. 인메모리 Rate Limiting
**위치**: `src/lib/rate-limit.ts`
**문제**: Map 기반 → 서버 재시작 시 초기화, 멀티 인스턴스 환경에서 무효
**해결 방안**: Upstash Rate Limit 또는 DB 기반
**상태**: ❌ 미해결

### 9. middleware.ts 부재
**문제**: Next.js middleware 없음 → 인증 체크/CORS/보안 헤더가 각 라우트에서 개별 처리
**해결 방안**: middleware.ts 생성 → 인증 경로 보호, 보안 헤더, CORS
**상태**: ❌ 미해결

### 10. pgvector 인덱스 미검증
**문제**: IVFFlat 인덱스 생성이 raw SQL migration에 의존 → 실제 생성 여부 미확인
**영향**: 벡터 검색이 full scan으로 동작할 수 있음
**해결 방안**: health check에 인덱스 존재 확인 추가, 또는 `prisma db push` 후 SQL 실행 스크립트
**상태**: ❓ 검증 필요

### 11. 에러 핸들링 비일관
**문제**: 52개 try-catch 인스턴스가 에러 처리 방식이 제각각
**해결 방안**: 공통 에러 핸들링 유틸리티 + API 응답 포맷 표준화
**상태**: ❌ 미해결
