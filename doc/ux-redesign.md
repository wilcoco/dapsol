# UX 리디자인 (UX Redesign)

## 배경

16+ 전문가 관점(Google, Meta, Apple, Notion, Yelp, StackOverflow, Reddit, Wikipedia, Spotify, Figma, Tufte, Cunningham, Hanson, Chou, Barabási, Ostrom, Tversky, Buterin, Brand, Maeda, Kelly, Julie Zhuo)의 의견을 종합하여 도출한 리디자인 방향.

## 핵심 변경

### 1. 온보딩 제거
- 분야 선택 등 초기 온보딩 플로우 삭제 완료
- 첫 사용자는 바로 검색/탐색으로 진입

### 2. 검색 우선 진입
```
[검색 입력] → 기존 Q&A 결과 표시
  → 만족: 해당 Q&A로 이동 (읽기/경작/사냥)
  → 불만족: "새 영토 개척하기" → 새 Q&A 시작
```

### 3. 문명 메타포 적용
모든 UI 텍스트에 문명 건설 메타포 사용:
- "투자" → "경작" (긍정), "사냥" (부정)
- "새 질문" → "개척"
- "공유" → "영토 공개"
- QASet → 영토, Cluster → 마을, 전체 → 문명

### 4. 탭 구조 (4탭)

| 탭 | 아이콘 | 내용 |
|----|--------|------|
| 🏠 영토 | Home | 실시간 활동 피드 + 추천 Q&A + 미니맵 |
| ✨ 개척 | Pioneer | 새 질문 → AI 대화 → 공유 |
| 🗺️ 지도 | Map | 3-level 줌 지식 그래프 |
| 👤 나 | Profile | 내 영토, 투자, 점수, 알림 |

### 5. 실시간 활동 피드
홈 탭 상단에 "지금 일어나고 있는 일" 피드:
- 새로운 영토 개척됨
- 경작/사냥 활동
- 마일스톤 달성
- 새 마을(클러스터) 형성

### 6. 3-Level 줌 (지도 탭)
```
영토 (QASet) ←→ 마을 (Cluster) ←→ 문명 지도 (Cluster Relations)
```
- 영토: 개별 Q&A 내용, 메시지 노드
- 마을: 클러스터 내 QASet들, 관계 엣지
- 문명: 클러스터 간 SKOS 관계 네트워크

### 7. 🤖→👤 시그니처
AI가 인간에게 질문하는 역방향 흐름의 시각적 아이콘.
다른 AI 서비스와의 차별화 포인트.

### 8. Canonical Q&A (블록체인 영감)
중복 질문 처리:
- 가장 강한 Q&A가 canonical(정본)
- 약한 Q&A는 subordinate(부속)
- 충분히 약하면 absorbed(흡수)

QASet에 `canonicalStatus` 필드 추가 필요:
```
canonical  → 정본 (해당 주제의 대표)
subordinate → 부속 (canonical에 연결)
absorbed   → 흡수 (독립 표시 없음, canonical에 통합)
```

## 현재 구현 상태

| 항목 | 상태 |
|------|------|
| 온보딩 제거 | ✅ 완료 |
| 3-level 줌 | ✅ 95% (컴포넌트 존재) |
| 문명 메타포 UI 텍스트 | ❌ 미적용 |
| 4탭 구조 | ❌ 미적용 (현재 3섹션) |
| 실시간 활동 피드 | ❌ 미구현 |
| Canonical Q&A | ❌ 미구현 |
| 🤖→👤 시그니처 | ❌ 미적용 |
