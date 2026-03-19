/**
 * 자동차 범퍼 제조업 샘플 시드
 *
 * 실행: npx tsx prisma/seed-bumper.ts
 *
 * - 사용자 6명 (제조 현장 역할별)
 * - Q&A 8개 (사출, 도장, 품질, 설비, 원가, 안전 등)
 * - 의견(OpinionNode) 5개
 * - 투자 15건 + 반대투자 3건
 * - TopicCluster 3개 + ClusterRelation
 * - NodeRelation 6개
 * - KnowledgeGap 4개
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🏭 범퍼 제조업 시드 데이터 생성 시작...\n");

  // ── 1. 사용자 6명 (제조업 역할) ──
  const users = await Promise.all([
    upsertUser("박공장장", 15000, 2.0, 250),   // 공장장
    upsertUser("김품질팀장", 12000, 1.8, 200),  // 품질관리
    upsertUser("이사출기술", 10000, 1.5, 160),  // 사출 기술자
    upsertUser("최도장전문", 9000, 1.3, 140),   // 도장 전문가
    upsertUser("정설비엔지니어", 8500, 1.2, 120), // 설비 엔지니어
    upsertUser("한신입사원", 7000, 0.8, 100),   // 신입
  ]);
  const [factory, quality, injection, painting, equipment, newbie] = users;
  console.log(`✅ 사용자 ${users.length}명 생성`);

  // ── 2. 태그 ──
  const tags = await Promise.all([
    upsertTag("사출성형"),
    upsertTag("도장공정"),
    upsertTag("품질관리"),
    upsertTag("설비보전"),
    upsertTag("원가절감"),
    upsertTag("안전관리"),
    upsertTag("범퍼"),
    upsertTag("PP소재"),
    upsertTag("금형"),
  ]);
  console.log(`✅ 태그 ${tags.length}개 생성`);

  // ── 3. Q&A 세트 ──

  // QA1: 사출 성형 수축 문제 (이사출기술)
  const qa1 = await createQASet({
    creatorId: injection.id,
    title: "PP 범퍼 사출 시 수축 마크(Sink Mark) 해결 방법",
    summary: "리브 두께와 보압 조건 최적화로 수축 마크 제거",
    isShared: true,
    totalInvested: 380,
    investorCount: 4,
    qualityPool: 150,
    authorityScore: 3.5,
    creatorAuthorityStake: 160,
    searchKeywords: "사출성형, 수축마크, sink mark, PP, 폴리프로필렌, 리브, 보압, 금형온도, 범퍼, injection molding, shrinkage",
    tagNames: ["사출성형", "범퍼", "PP소재", "금형"],
    messages: [
      { role: "user", content: "PP 범퍼 사출할 때 리브 뒤쪽에 수축 마크가 계속 발생합니다. 리브 두께를 벽두께의 60%로 설계했는데도 문제가 생깁니다. 어떻게 해결할 수 있을까요?", relationSimple: null },
      { role: "assistant", content: "PP 범퍼의 수축 마크 문제는 복합적 원인이 있습니다:\n\n**1. 설계 측면**\n- 리브 두께를 벽두께의 50% 이하로 줄이세요 (현재 60%는 과다)\n- 리브 근원부에 R0.5~1.0mm 라운드 추가\n- 가능하면 리브 대신 허니콤 패턴이나 보스 구조 검토\n\n**2. 성형 조건**\n- 보압(Packing Pressure)을 최대 사출압의 60~80%로 설정\n- 보압 시간을 게이트 실링 시간까지 충분히 확보 (최소 8~12초)\n- 금형 온도를 40~50°C로 유지 (PP 결정화 제어)\n- 냉각 시간 연장: 벽두께 1mm당 2~3초\n\n**3. 금형 측면**\n- 리브 반대편에 가스 벤트 추가\n- 게이트 위치를 수축 발생 부위 가까이로 이동\n- 냉각수 채널이 리브 부근을 통과하도록 설계", relationSimple: null },
      { role: "user", content: "보압 시간을 늘리면 사이클 타임이 길어지는데, 생산성과 품질 사이의 균형은 어떻게 잡나요?", relationSimple: "심화" },
      { role: "assistant", content: "좋은 질문입니다. 생산성-품질 트레이드오프 해결 방법:\n\n**단기 대책 (조건 최적화)**\n- 다단 보압 사용: 1단 80% → 2단 60% → 3단 40%로 점감\n- 이렇게 하면 보압 시간 30% 단축하면서도 수축 억제 가능\n- 금형 온도를 존(zone)별로 차등 설정\n\n**중기 대책 (금형 개선)**\n- 컨포멀 쿨링(Conformal Cooling) 적용으로 냉각 효율 40% 향상\n- 밸브 게이트 시스템으로 보압 전달 최적화\n\n**장기 대책 (설계 변경)**\n- FEA 시뮬레이션(Moldflow)으로 최적 리브/벽두께 재설계\n- 수축률 보정값을 금형 가공 시 반영\n\n실제 현장에서는 다단 보압만으로 사이클 타임 2~3초 절약하면서 수축 마크를 없앤 사례가 많습니다.", relationSimple: null },
    ],
  });

  // QA2: 도장 불량 (최도장전문)
  const qa2 = await createQASet({
    creatorId: painting.id,
    title: "범퍼 도장 시 오렌지 필(Orange Peel) 현상 원인과 대책",
    summary: "도막 두께, 점도, 부스 환경 조건 최적화",
    isShared: true,
    totalInvested: 290,
    investorCount: 3,
    qualityPool: 120,
    authorityScore: 2.8,
    creatorAuthorityStake: 140,
    searchKeywords: "도장, 오렌지필, orange peel, 도막, 점도, 스프레이, 범퍼 도장, 도장 부스, 클리어코트, painting defect",
    tagNames: ["도장공정", "범퍼", "품질관리"],
    messages: [
      { role: "user", content: "범퍼 도장 후 표면이 오렌지 껍질처럼 울퉁불퉁합니다. 도료 점도와 스프레이 건 설정을 조정해봤는데 계속 발생합니다. 원인이 뭘까요?", relationSimple: null },
      { role: "assistant", content: "오렌지 필 현상의 주요 원인과 대책입니다:\n\n**원인 분석**\n1. **도료 점도 부적합**: Ford Cup #4 기준 16~18초가 적정 (너무 높으면 레벨링 불량)\n2. **스프레이 거리/패턴**: 건-표면 거리 25~30cm, 패턴 폭 25~30cm 유지\n3. **부스 환경**: 온도 23±2°C, 습도 60±5% 필수\n4. **플래시 타임 부족**: 베이스코트→클리어코트 사이 5~10분 건조\n5. **PP 소재 전처리 불량**: 화염처리 또는 프라이머 부착력 부족\n\n**즉시 조치**\n- 도막 두께 확인: 베이스 15~20μm, 클리어 30~40μm\n- 에어 압력: 아토마이징 에어 3~4bar, 팬 에어 2~3bar\n- 시너(Thinner)를 슬로우 타입으로 교체하여 레벨링 시간 확보\n- 부스 내 기류 속도 0.3~0.5m/s 확인", relationSimple: null },
      { role: "user", content: "PP 소재 전처리가 중요하다고 하셨는데, 화염처리와 프라이머 중 어떤 게 더 효과적인가요?", relationSimple: "심화" },
      { role: "assistant", content: "**화염처리 vs 프라이머 비교**\n\n| 항목 | 화염처리 | 프라이머 |\n|------|---------|--------|\n| 부착력 | ★★★★ (다인값 42+ 가능) | ★★★★★ (가장 안정적) |\n| 비용 | 저렴 (가스비만) | 높음 (프라이머 도료비) |\n| 공정 시간 | 빠름 (3~5초/부품) | 느림 (도포+건조 15분) |\n| 균일성 | 숙련도에 의존 | 자동화 용이 |\n| 환경 | VOC 없음 | VOC 발생 |\n\n**현장 추천**: 대량생산 라인에서는 **화염처리 + 얇은 프라이머 병용**이 최적입니다.\n- 화염처리로 표면 에너지를 38dyne/cm 이상으로 올리고\n- 얇은 프라이머(5~8μm)로 안정적 부착력 확보\n- 이 방식이 원가와 품질 균형에서 업계 표준입니다.", relationSimple: null },
    ],
  });

  // QA3: 금형 유지보수 (정설비엔지니어)
  const qa3 = await createQASet({
    creatorId: equipment.id,
    title: "범퍼 금형 수명 연장을 위한 예방보전 주기와 방법",
    summary: "금형 10만샷 이상 사용을 위한 체계적 보전 전략",
    isShared: true,
    totalInvested: 250,
    investorCount: 3,
    qualityPool: 100,
    authorityScore: 2.5,
    creatorAuthorityStake: 120,
    searchKeywords: "금형, 보전, 수명, 예방보전, PM, 범퍼금형, 파팅라인, 이젝터핀, mold maintenance, preventive",
    tagNames: ["금형", "설비보전", "범퍼"],
    messages: [
      { role: "user", content: "범퍼 금형이 5만 샷 정도에서 파팅라인 버(Burr)가 심해지고 이젝터 핀 마모로 외관 불량이 증가합니다. 체계적인 예방보전 방법이 있을까요?", relationSimple: null },
      { role: "assistant", content: "범퍼 금형 예방보전 체계를 단계별로 안내합니다:\n\n**일상 점검 (매 생산 후)**\n- 파팅면 청소 및 이물질 제거\n- 가스 벤트 막힘 확인 (면봉 테스트)\n- 냉각수 온도차 ΔT 확인 (입출구 5°C 이내)\n\n**정기 PM (1만 샷마다)**\n- 이젝터 핀 마모도 측정 (마이크로미터)\n- 슬라이드 코어 윤활 (고온 몰리브덴 그리스)\n- O링/씰 교체\n- 핫러너 노즐팁 상태 확인\n\n**중정비 (5만 샷마다)**\n- 파팅면 연마 또는 용접 보수\n- 냉각수 채널 스케일 제거 (초음파 세척)\n- 이젝터 핀 전수 교체\n- 코어/캐비티 표면 크롬 재도금 검토\n\n**오버홀 (10만 샷)**\n- 전체 분해 점검\n- 가이드 핀/부시 교체\n- 열처리 상태 확인 (경도 HRC 체크)\n\n이 주기를 따르면 금형 수명을 15~20만 샷까지 연장할 수 있습니다.", relationSimple: null },
    ],
  });

  // QA4: 원가절감 (박공장장)
  const qa4 = await createQASet({
    creatorId: factory.id,
    title: "범퍼 원가 절감 10% 달성 전략 — 소재부터 공정까지",
    summary: "PP 컴파운드 최적화와 사이클 타임 단축 중심",
    isShared: true,
    totalInvested: 520,
    investorCount: 5,
    qualityPool: 220,
    authorityScore: 4.0,
    creatorAuthorityStake: 250,
    searchKeywords: "원가절감, 비용, 범퍼, PP, 사이클타임, 재활용, 리사이클, 스크랩, cost reduction, bumper",
    tagNames: ["원가절감", "범퍼", "PP소재", "사출성형"],
    messages: [
      { role: "user", content: "현재 범퍼 부품 원가가 OEM 요구보다 높습니다. 품질을 유지하면서 10% 원가 절감을 달성할 수 있는 방법이 있을까요?", relationSimple: null },
      { role: "assistant", content: "범퍼 원가 10% 절감은 다음 영역의 복합 접근으로 달성 가능합니다:\n\n**1. 소재비 절감 (전체 원가의 40~50%)**\n- PP 컴파운드에 재생 PP(rPP) 20~30% 혼합 → 소재비 15% 절감\n- 탈크 필러 함량 최적화 (20% → 25%): 물성 유지하면서 PP 사용량 감소\n- 범퍼 스크랩 사내 재활용 시스템 구축 (현재 외부 매각 대비 3배 절약)\n\n**2. 가공비 절감 (전체 원가의 25~30%)**\n- 사이클 타임 5초 단축 목표: 냉각 최적화 + 다단 사출\n- 불량률 3% → 1.5% 감소 (= 순생산량 1.5% 증가)\n- 금형 다수개 취로 변경 검토 (1→2개 취, 신규 금형 투자 필요)\n\n**3. 도장비 절감 (전체 원가의 15~20%)**\n- 무도장(In-Mold Color) 범퍼 적용 가능 여부 OEM과 협의\n- 도료 사용량 최적화: 로보틱 스프레이 패스 재프로그래밍\n- 도장 불량률 감소 → 재작업비 절감\n\n**4. 물류/관리비 (10%)**\n- 포장재 간소화, 적재 효율 개선\n\n단기에 가장 효과적인 것은 **rPP 혼합 + 사이클 타임 단축**입니다.", relationSimple: null },
      { role: "user", content: "재생 PP 사용 시 물성 저하는 없나요? OEM 스펙을 만족시킬 수 있을까요?", relationSimple: "검증" },
      { role: "assistant", content: "재생 PP(rPP) 사용 시 물성 관리 포인트입니다:\n\n**OEM 스펙 대비 rPP 혼합 영향**\n- 충격강도(Izod): 20% rPP까지는 95% 이상 유지 (30% 초과 시 급감)\n- 인장강도: 변화 미미 (5% 이내)\n- 내열성(HDT): 거의 동일\n- 외관(광택/색상): 컬러 매칭 주의 필요\n\n**성공 조건**\n1. rPP 공급원 관리: 자사 스크랩 > 지정업체 > 일반 재생원\n2. MFI(용융지수) 관리: 입고 시 로트별 MFI 검사 필수\n3. 혼합 비율 정밀 제어: 중량식 블렌더 사용\n4. 시험 인증: OEM에 rPP 적용 보고서 제출 (보통 20%는 승인됨)\n\n현대·기아는 이미 범퍼에 rPP 20% 이상 적용 중이며, 유럽 OEM은 25%를 요구하는 추세입니다. 적극 추진하셔도 됩니다.", relationSimple: null },
    ],
  });

  // QA5: 사출 불량 종합 (한신입사원)
  const qa5 = await createQASet({
    creatorId: newbie.id,
    title: "범퍼 사출 불량 유형별 원인과 대책 총정리",
    summary: "신입 사출 기술자를 위한 불량 트러블슈팅 가이드",
    isShared: true,
    totalInvested: 180,
    investorCount: 2,
    qualityPool: 80,
    authorityScore: 1.8,
    creatorAuthorityStake: 100,
    searchKeywords: "사출불량, 웰드라인, 플로우마크, 버, 미성형, 변형, 범퍼, injection defect, weld line, flow mark, short shot",
    tagNames: ["사출성형", "품질관리", "범퍼"],
    messages: [
      { role: "user", content: "신입 사출 기술자입니다. 범퍼 사출에서 자주 발생하는 불량 유형과 원인, 해결방법을 정리해주실 수 있나요?", relationSimple: null },
      { role: "assistant", content: "범퍼 사출 주요 불량 유형별 정리입니다:\n\n**1. 웰드라인(Weld Line)**\n- 원인: 수지 흐름이 만나는 합류점에서 융합 부족\n- 대책: 사출 속도↑, 수지 온도↑(220→235°C), 금형 온도↑, 게이트 위치 변경\n\n**2. 플로우 마크(Flow Mark)**\n- 원인: 수지 선단부 고화, 사출 속도 부족\n- 대책: 다단 사출(게이트 근처 저속→충전 고속), 수지 온도 5~10°C 상승\n\n**3. 미성형(Short Shot)**\n- 원인: 충전 부족 (클램프력 부족, 가스 트랩, 유동 길이 과다)\n- 대책: 사출압↑, 가스 벤트 추가, 수지 온도↑\n\n**4. 버(Flash/Burr)**\n- 원인: 금형 파팅면 마모, 클램프력 부족, 과충전\n- 대책: 금형 PL면 연마, 보압 조정, 클램프력 확인\n\n**5. 변형(Warpage)**\n- 원인: 잔류응력, 불균일 냉각, 수축률 차이\n- 대책: 냉각 채널 밸런스, 보압 프로파일 최적화, 이형 후 지그 교정\n\n**6. 수축마크(Sink Mark)**\n- 원인: 두꺼운 부위 내부 수축\n- 대책: 리브 두께 50% 이하, 보압 시간 연장, 가스 어시스트\n\n각 불량마다 **성형 조건 → 금형 → 설계** 순서로 원인을 추적하세요.", relationSimple: null },
    ],
  });

  // QA6: 안전사고 예방 (김품질팀장)
  const qa6 = await createQASet({
    creatorId: quality.id,
    title: "사출 현장 안전사고 예방 — 끼임, 화상, 유해가스 대책",
    summary: "제조 현장 3대 위험요소에 대한 안전관리 체크리스트",
    isShared: true,
    totalInvested: 350,
    investorCount: 4,
    qualityPool: 140,
    authorityScore: 3.0,
    creatorAuthorityStake: 200,
    searchKeywords: "안전, 사고, 끼임, 화상, 유해가스, VOC, 사출, 도장, 안전관리, safety, injection molding safety",
    tagNames: ["안전관리", "사출성형", "도장공정"],
    messages: [
      { role: "user", content: "사출/도장 현장에서 가장 빈번한 안전사고 유형과 예방 대책을 알려주세요. 신규 작업자 교육 자료에 포함할 내용입니다.", relationSimple: null },
      { role: "assistant", content: "범퍼 제조 현장 3대 안전 위험과 대책입니다:\n\n**1. 끼임 사고 (사출기)**\n- 위험: 금형 열림/닫힘 시 손·팔 끼임 (가장 빈번, 가장 심각)\n- 대책:\n  · 안전문 인터록 100% 작동 확인 (매 교대 시)\n  · 양수 조작 버튼 의무화\n  · 금형 내 작업 시 반드시 안전 블록 삽입\n  · 로봇 취출 적용 시 안전 펜스 내 진입 금지\n\n**2. 화상 사고**\n- 위험: 용융 수지(200°C+), 핫러너 노즐, 금형 표면\n- 대책:\n  · 내열 장갑(300°C급) 착용 의무화\n  · 퍼징(Purging) 작업 시 보호 안면 차양\n  · 금형 표면 온도 표시 스티커 부착\n  · 용융 수지 비산 방지 커버 설치\n\n**3. 유해가스/화학물질 (도장 부스)**\n- 위험: VOC(톨루엔, 자일렌), 이소시아네이트(클리어코트)\n- 대책:\n  · 급배기 시스템 정상 가동 확인 (풍속 0.3m/s 이상)\n  · 유기가스용 방독 마스크 착용 (2주마다 필터 교체)\n  · 작업환경측정 반기 1회 실시\n  · 밀폐공간 작업 시 산소농도 측정\n\n**공통**: 매월 안전 교육, 아차사고 보고 제도, 비상정지 버튼 위치 숙지", relationSimple: null },
    ],
  });

  // QA7: VOC 규제 (최도장전문)
  const qa7 = await createQASet({
    creatorId: painting.id,
    title: "수성 도료 전환 시 범퍼 도장 품질 유지 방법",
    summary: "VOC 규제 대응을 위한 수성 도료 적용 노하우",
    isShared: true,
    totalInvested: 200,
    investorCount: 3,
    qualityPool: 80,
    authorityScore: 2.2,
    creatorAuthorityStake: 140,
    searchKeywords: "수성도료, VOC, 환경규제, 도장, 범퍼, waterborne paint, VOC regulation, humidity control",
    tagNames: ["도장공정", "범퍼", "품질관리"],
    messages: [
      { role: "user", content: "환경규제로 유성→수성 도료 전환을 검토 중입니다. 범퍼 도장에서 수성 도료 적용 시 주의할 점은?", relationSimple: null },
      { role: "assistant", content: "수성 도료 전환 시 핵심 관리 포인트:\n\n**1. 부스 환경 정밀 제어**\n- 습도가 가장 중요: 50~65% RH 유지 (유성은 관대했지만 수성은 치명적)\n- 온도: 23~25°C (유성 대비 좁은 범위)\n- 별도 제습/가습 설비 투자 필요 (약 2~3억원)\n\n**2. 건조 공정 변경**\n- 프리히팅(Pre-heat) 존 추가: 80°C에서 3~5분 수분 증발\n- 기존 건조로 온도 조정: 베이스코트 80°C / 클리어 140°C\n- 적외선(IR) 건조기 병용으로 건조 시간 30% 단축 가능\n\n**3. 도장 조건 재설정**\n- 수성 전용 벨컵/스프레이건 필요 (부식 방지 소재)\n- 회전수, 셰이핑 에어 전면 재조건 확립\n- 도막 두께: 유성 대비 10~15% 두껍게 도포\n\n**4. 품질 리스크**\n- 초기 3개월은 워터마크(물방울 자국) 불량 증가 예상\n- 색상 매칭 전면 재작업 (수성 메탈릭은 알루미늄 배향이 다름)\n\n총 투자비 5~8억원, ROI 회수 기간 약 2~3년이지만, 규제 대응과 ESG 관점에서 필수입니다.", relationSimple: null },
    ],
  });

  // QA8: 치수 관리 (김품질팀장)
  const qa8 = await createQASet({
    creatorId: quality.id,
    title: "범퍼-차체 갭(Gap) & 단차(Flush) 품질 관리 기준",
    summary: "OEM 갭/단차 스펙 달성을 위한 측정 및 관리 방법",
    isShared: true,
    totalInvested: 310,
    investorCount: 4,
    qualityPool: 130,
    authorityScore: 3.2,
    creatorAuthorityStake: 200,
    searchKeywords: "갭, 단차, flush, gap, 치수관리, 범퍼 장착, fitting, CMM, 검구, 지그, dimensional control",
    tagNames: ["품질관리", "범퍼"],
    messages: [
      { role: "user", content: "범퍼 장착 시 차체와의 갭(Gap)과 단차(Flush)가 OEM 스펙을 벗어나는 경우가 많습니다. 어떻게 관리해야 할까요?", relationSimple: null },
      { role: "assistant", content: "범퍼 갭/단차 품질 관리 체계입니다:\n\n**OEM 일반 스펙 (참고)**\n- 갭: 3.5±1.0mm (좌우 대칭차 0.5mm 이내)\n- 단차: 0.0±1.0mm (범퍼가 차체보다 돌출/함몰)\n\n**측정 체계**\n1. 검구(Checking Fixture): 매 로트 첫/중/끝 부품 측정\n2. CMM(3차원 측정기): 주 1회 정밀 측정 (핵심 포인트 20~30개)\n3. 옵티컬 스캐너: 월 1회 전체 면 프로파일 비교\n\n**불량 원인 Top 3**\n1. **사출 후 변형**: 범퍼 자체 휨 → 냉각 균일화, 이형 후 교정 지그\n2. **브라켓 위치 편차**: 장착 브라켓 홀 위치 오차 → 금형 수정\n3. **차체 측 편차**: 차체 판넬 편차가 원인 → OEM과 공동 분석\n\n**관리 포인트**\n- SPC(통계적 공정관리): Cp/Cpk 1.33 이상 유지\n- 범퍼↔차체 매칭: 시뮬레이션(가상 조립) 활용\n- 금형 보정: 워피지 역보정값 반영\n- 계절별 수축률 변화 관리 (겨울/여름 차이 최대 0.3mm)", relationSimple: null },
      { role: "user", content: "좌우 대칭 갭 차이가 0.5mm를 넘을 때 원인을 어떻게 추적하나요?", relationSimple: "명확화" },
      { role: "assistant", content: "갭 비대칭 원인 추적 프로세스:\n\n**Step 1: 부품 단품 확인**\n- 범퍼를 검구에 올려 좌우 브라켓 홀 위치 비교\n- 단품 자체 비대칭이면 → 금형/성형 조건 문제\n\n**Step 2: 금형 확인**\n- 슬라이드 코어 마모 좌우 비교\n- 이젝터 불균일로 인한 이형 시 변형 체크\n- 냉각수 좌우 밸런스 확인 (유량계)\n\n**Step 3: 성형 조건**\n- 게이트 밸런스: 핫러너 각 존 온도 편차\n- 사출 시 좌우 충전 밸런스 (숏샷 테스트)\n\n**Step 4: 차체 측 원인**\n- 차체 장착면 좌우 포인트 CMM 데이터 요청\n- 차체 용접 지그 편차일 가능성 (OEM 품질팀 공동 분석)\n\n**경험적 비율**: 부품 원인 60% / 차체 원인 30% / 장착 작업 원인 10%\n현장에서는 Step 1에서 70%가 해결됩니다.", relationSimple: null },
    ],
  });

  console.log(`✅ Q&A ${8}개 생성`);

  // ── 4. TopicCluster 3개 ──
  const cluster1 = await prisma.topicCluster.create({
    data: {
      name: "사출 성형 기술",
      nameEn: "Injection Molding Technology",
      description: "PP 범퍼 사출 성형 조건, 불량 대책, 금형 관리에 관한 주제 영역",
    },
  });
  const cluster2 = await prisma.topicCluster.create({
    data: {
      name: "도장 공정 및 환경",
      nameEn: "Painting Process & Environment",
      description: "범퍼 도장 품질, 수성 도료 전환, VOC 규제 대응 관련 주제 영역",
    },
  });
  const cluster3 = await prisma.topicCluster.create({
    data: {
      name: "품질 및 원가 관리",
      nameEn: "Quality & Cost Management",
      description: "갭/단차 관리, 원가절감, 안전관리 등 경영 관점의 주제 영역",
    },
  });

  // Assign clusters to QASets
  await prisma.qASet.update({ where: { id: qa1.id }, data: { topicClusterId: cluster1.id } });
  await prisma.qASet.update({ where: { id: qa3.id }, data: { topicClusterId: cluster1.id } });
  await prisma.qASet.update({ where: { id: qa5.id }, data: { topicClusterId: cluster1.id } });
  await prisma.qASet.update({ where: { id: qa2.id }, data: { topicClusterId: cluster2.id } });
  await prisma.qASet.update({ where: { id: qa7.id }, data: { topicClusterId: cluster2.id } });
  await prisma.qASet.update({ where: { id: qa4.id }, data: { topicClusterId: cluster3.id } });
  await prisma.qASet.update({ where: { id: qa6.id }, data: { topicClusterId: cluster3.id } });
  await prisma.qASet.update({ where: { id: qa8.id }, data: { topicClusterId: cluster3.id } });
  console.log(`✅ TopicCluster 3개 + QASet 배정 완료`);

  // ── 5. ClusterRelation ──
  await prisma.clusterRelation.createMany({
    data: [
      { sourceClusterId: cluster1.id, targetClusterId: cluster3.id, relationType: "narrower", weight: 2.0, label: "하위" },
      { sourceClusterId: cluster2.id, targetClusterId: cluster3.id, relationType: "narrower", weight: 1.5, label: "하위" },
      { sourceClusterId: cluster1.id, targetClusterId: cluster2.id, relationType: "related", weight: 1.0, label: "관련" },
    ],
  });
  console.log(`✅ ClusterRelation 3개 생성`);

  // ── 6. 투자 (15건 긍정 + 3건 반대) ──
  const qaIds = [qa1.id, qa2.id, qa3.id, qa4.id, qa5.id, qa6.id, qa7.id, qa8.id];

  // 긍정 투자
  const investments = [
    // qa1 (사출 수축)
    { qaSetId: qa1.id, userId: quality.id, amount: 120, position: 1 },
    { qaSetId: qa1.id, userId: factory.id, amount: 150, position: 2 },
    { qaSetId: qa1.id, userId: painting.id, amount: 60, position: 3 },
    { qaSetId: qa1.id, userId: newbie.id, amount: 50, position: 4 },
    // qa2 (도장 오렌지필)
    { qaSetId: qa2.id, userId: quality.id, amount: 100, position: 1 },
    { qaSetId: qa2.id, userId: injection.id, amount: 80, position: 2 },
    { qaSetId: qa2.id, userId: factory.id, amount: 110, position: 3 },
    // qa4 (원가절감)
    { qaSetId: qa4.id, userId: quality.id, amount: 130, position: 1 },
    { qaSetId: qa4.id, userId: injection.id, amount: 100, position: 2 },
    { qaSetId: qa4.id, userId: painting.id, amount: 90, position: 3 },
    { qaSetId: qa4.id, userId: equipment.id, amount: 80, position: 4 },
    { qaSetId: qa4.id, userId: newbie.id, amount: 120, position: 5 },
    // qa6 (안전)
    { qaSetId: qa6.id, userId: factory.id, amount: 200, position: 1 },
    { qaSetId: qa6.id, userId: injection.id, amount: 80, position: 2 },
    { qaSetId: qa6.id, userId: newbie.id, amount: 70, position: 3 },
    // qa8 (갭/단차)
    { qaSetId: qa8.id, userId: injection.id, amount: 110, position: 1 },
    { qaSetId: qa8.id, userId: painting.id, amount: 90, position: 2 },
    { qaSetId: qa8.id, userId: equipment.id, amount: 60, position: 3 },
    { qaSetId: qa8.id, userId: factory.id, amount: 50, position: 4 },
  ];

  for (const inv of investments) {
    await prisma.investment.create({
      data: {
        qaSetId: inv.qaSetId,
        userId: inv.userId,
        amount: inv.amount,
        effectiveAmount: Math.sqrt(inv.amount) * 1.2,
        position: inv.position,
        isActive: true,
        isNegative: false,
      },
    });
  }

  // 반대 투자
  const negInvestments = [
    { qaSetId: qa5.id, userId: injection.id, amount: 50, reason: "불량 유형 정리가 너무 일반적이고 범퍼 특화 내용이 부족" },
    { qaSetId: qa7.id, userId: equipment.id, amount: 40, reason: "수성 도료 투자비 5~8억은 과대 추정, 실제로는 3~4억이면 충분" },
    { qaSetId: qa4.id, userId: quality.id, amount: 30, reason: "rPP 20% 혼합 시 장기 내후성 데이터가 불충분" },
  ];

  for (const inv of negInvestments) {
    await prisma.investment.create({
      data: {
        qaSetId: inv.qaSetId,
        userId: inv.userId,
        amount: inv.amount,
        effectiveAmount: Math.sqrt(inv.amount) * 1.0,
        position: 1,
        isActive: true,
        isNegative: true,
        huntingReason: inv.reason,
      },
    });
  }
  console.log(`✅ 투자 ${investments.length}건 + 반대투자 ${negInvestments.length}건`);

  // ── 7. NodeRelation (QASet간 지식 관계) ──
  await prisma.nodeRelation.createMany({
    data: [
      { sourceQASetId: qa1.id, targetQASetId: qa5.id, relationType: "specialization", isAIGenerated: true, isUserModified: false },
      { sourceQASetId: qa5.id, targetQASetId: qa3.id, relationType: "prerequisite", isAIGenerated: true, isUserModified: true },
      { sourceQASetId: qa2.id, targetQASetId: qa7.id, relationType: "extension", isAIGenerated: true, isUserModified: false },
      { sourceQASetId: qa4.id, targetQASetId: qa1.id, relationType: "cause_effect", isAIGenerated: false, isUserModified: false },
      { sourceQASetId: qa6.id, targetQASetId: qa1.id, relationType: "evidence", isAIGenerated: true, isUserModified: true },
      { sourceQASetId: qa8.id, targetQASetId: qa4.id, relationType: "evidence", isAIGenerated: false, isUserModified: false },
    ],
  });
  console.log(`✅ NodeRelation 6개 생성`);

  // ── 8. OpinionNode (의견) ──
  const opinions = [
    {
      userId: factory.id,
      content: "rPP 20% 혼합은 이미 현대차 2차 벤더에서 3년간 적용해봤는데, 실사용 내후성 문제 없었습니다. 다만 색상 로트 편차 관리가 핵심입니다.",
      targetQASetId: qa4.id,
      relationType: "evidence",
    },
    {
      userId: injection.id,
      content: "다단 보압 프로파일은 좋은 방법이지만, 금형 게이트 크기가 3mm 이하면 효과가 제한적입니다. 게이트 크기를 먼저 확인하세요.",
      targetQASetId: qa1.id,
      relationType: "counterargument",
    },
    {
      userId: quality.id,
      content: "갭/단차 관리에서 계절별 편차를 언급했는데, 실제로 여름에 생산된 범퍼는 겨울 장착 시 0.2~0.3mm 수축해서 갭이 벌어집니다. 이것을 금형 보정에 반영하면 좋습니다.",
      targetQASetId: qa8.id,
      relationType: "elaboration",
    },
    {
      userId: newbie.id,
      content: "신입 입장에서 불량 가이드가 정말 도움이 됩니다. 다만 각 불량별 실제 사진이 있으면 현장에서 판별이 쉬울 것 같습니다.",
      targetQASetId: qa5.id,
      relationType: "elaboration",
    },
    {
      userId: equipment.id,
      content: "수성 도료 투자비는 부스 규모에 따라 천차만별입니다. 소형 부스(범퍼 전용)면 3억이면 충분하고, 대형 라인 전환이면 8억도 부족할 수 있습니다.",
      targetQASetId: qa7.id,
      relationType: "counterargument",
    },
  ];

  for (const op of opinions) {
    const opNode = await prisma.opinionNode.create({
      data: {
        userId: op.userId,
        content: op.content,
      },
    });
    // Link to target QASet
    await prisma.nodeRelation.create({
      data: {
        sourceOpinion: { connect: { id: opNode.id } },
        targetQASet: { connect: { id: op.targetQASetId } },
        relationType: op.relationType,
      },
    });
  }
  console.log(`✅ OpinionNode ${opinions.length}개 + 관계 생성`);

  // ── 9. KnowledgeGap ──
  await prisma.knowledgeGap.createMany({
    data: [
      {
        topicClusterId: cluster1.id,
        gapType: "missing_evidence",
        description: "컨포멀 쿨링(3D 프린팅 금형)의 범퍼 대형 금형 적용 사례와 실제 ROI 데이터가 부족합니다. 적용 경험이 있는 금형업체의 사례가 필요합니다.",
        affectedQASetIds: JSON.stringify([qa1.id, qa3.id]),
        severity: "high",
      },
      {
        topicClusterId: cluster2.id,
        gapType: "uncertain_answer",
        description: "수성 도료 적용 후 장기 내후성(3년 이상) 필드 데이터가 부족합니다. 수성 도료 양산 적용 3년 이상된 업체의 품질 추이 데이터가 필요합니다.",
        affectedQASetIds: JSON.stringify([qa2.id, qa7.id]),
        severity: "high",
      },
      {
        topicClusterId: cluster3.id,
        gapType: "conflicting_claims",
        description: "rPP(재생 PP) 혼합 비율에 대해 20%는 안전하다는 의견과, 장기 내후성 리스크가 있다는 의견이 대립합니다. OEM 인증 시험 경험자의 의견이 필요합니다.",
        affectedQASetIds: JSON.stringify([qa4.id]),
        severity: "medium",
      },
      {
        topicClusterId: cluster1.id,
        gapType: "inconsistency",
        description: "금형 예방보전 주기에 대해 '1만 샷'과 '시간 기반(500시간)'이 혼재되어 있습니다. 어떤 기준이 더 실효적인지 현장 데이터가 필요합니다.",
        affectedQASetIds: JSON.stringify([qa3.id]),
        severity: "medium",
      },
    ],
  });
  console.log(`✅ KnowledgeGap 4개 생성`);

  // ── 10. 알림 ──
  await prisma.notification.createMany({
    data: [
      { userId: injection.id, type: "investment_received", title: "투자 알림", body: "김품질팀장님이 'PP 범퍼 수축 마크 해결'에 120💎 투자했습니다.", link: `/?qaSetId=${qa1.id}` },
      { userId: factory.id, type: "milestone", title: "마일스톤 달성", body: "'범퍼 원가 절감 10%' Q&A가 투자자 5명을 달성! 품질 풀 해제.", link: `/?qaSetId=${qa4.id}` },
      { userId: painting.id, type: "hunt_received", title: "반대투자 알림", body: "정설비엔지니어님이 '수성 도료 전환'에 반대투자 40💎를 했습니다.", link: `/?qaSetId=${qa7.id}` },
      { userId: newbie.id, type: "reward_earned", title: "보상 획득", body: "투자 보상으로 25💎를 받았습니다.", link: `/?qaSetId=${qa4.id}` },
    ],
  });
  console.log(`✅ 알림 4개 생성`);

  // ── 11. 시스템 AI 유저 + 커뮤니티 클러스터 + AI 생성 질문 ──
  const systemAI = await prisma.user.upsert({
    where: { email: "system-ai@collective-intelligence.local" },
    update: {},
    create: { name: "AI 시스템", email: "system-ai@collective-intelligence.local", isSystemAI: true, balance: 0, trustLevel: 5 },
  });
  console.log(`✅ 시스템 AI 유저 생성`);

  // 기존 전문 클러스터에 AI 질문 활성화
  await prisma.topicCluster.updateMany({
    where: { id: { in: [cluster1.id, cluster2.id, cluster3.id] } },
    data: { aiQuestionEnabled: true, aiQuestionType: "professional" },
  });

  // 커뮤니티 클러스터 3개
  const commCluster1 = await prisma.topicCluster.create({
    data: {
      name: "유머/경험담",
      nameEn: "Humor & Stories",
      description: "제조 현장에서 겪은 재미있고 황당한 경험을 공유하세요",
      isManual: false,
      aiQuestionEnabled: true,
      aiQuestionType: "community",
      aiPromptHint: "제조업 현장에서의 재미있고 황당한 경험을 묻는 질문. 가볍고 유머러스하게.",
    },
  });
  const commCluster2 = await prisma.topicCluster.create({
    data: {
      name: "오늘 배운 것",
      nameEn: "Today I Learned",
      description: "오늘 새로 알게 된 제조/기술 관련 사실을 공유하세요",
      isManual: false,
      aiQuestionEnabled: true,
      aiQuestionType: "community",
      aiPromptHint: "제조업에서 사람들이 모를 만한 흥미로운 사실이나 팁을 묻는 질문.",
    },
  });
  const commCluster3 = await prisma.topicCluster.create({
    data: {
      name: "업무 꿀팁",
      nameEn: "Work Pro Tips",
      description: "다른 사람은 모르는 나만의 업무 노하우를 공유하세요",
      isManual: false,
      aiQuestionEnabled: true,
      aiQuestionType: "community",
      aiPromptHint: "제조 현장에서 효율을 높이는 실용적인 팁이나 노하우를 묻는 질문.",
    },
  });
  console.log(`✅ 커뮤니티 클러스터 3개 생성`);

  // AI 생성 질문 시드 (커뮤니티)
  const aiQuestions = [
    { clusterId: commCluster1.id, title: "공장에서 겪은 가장 황당한 불량 사고는?", question: "제조 현장에서 일하다 보면 예상치 못한 황당한 불량이 발생할 때가 있죠. 여러분이 겪은 가장 기억에 남는 황당한 불량 사고나 에피소드를 공유해주세요! 원인이 뭐였는지, 어떻게 해결했는지도 함께 알려주시면 더 좋습니다." },
    { clusterId: commCluster2.id, title: "오늘 알게 된 제조업 관련 신기한 사실은?", question: "제조업에서 일하면서 '이런 것도 있었어?'라고 놀란 적 있으신가요? 소재 특성, 공정 비밀, 업계 관행 등 오늘 새로 알게 된 흥미로운 사실을 공유해주세요." },
    { clusterId: commCluster3.id, title: "생산성을 2배로 올려준 나만의 업무 꿀팁은?", question: "같은 일을 해도 더 빠르고 정확하게 하는 나만의 방법이 있으신가요? 도구, 습관, 체크리스트, 엑셀 매크로 등 어떤 형태든 좋습니다. 현장에서 검증된 업무 꿀팁을 공유해주세요!" },
    { clusterId: commCluster1.id, title: "신입 때 저지른 최대 실수는?", question: "누구나 신입 시절에는 실수를 하죠. 지금 생각하면 웃기지만 당시에는 식은땀이 났던, 신입 때 저지른 가장 큰 실수를 공유해주세요. 후배들에게 좋은 교훈이 될 겁니다!" },
    { clusterId: commCluster3.id, title: "금형 세팅 시간을 절반으로 줄이는 방법 있나요?", question: "금형 교체와 세팅은 시간이 많이 걸리는 작업입니다. SMED(Single Minute Exchange of Die) 같은 정석 방법 외에, 현장에서 실제로 효과를 본 시간 단축 노하우가 있으면 공유해주세요!" },
  ];

  for (const q of aiQuestions) {
    await prisma.qASet.create({
      data: {
        title: q.title,
        creatorId: systemAI.id,
        topicClusterId: q.clusterId,
        isShared: true,
        sharedAt: new Date(),
        isAIGenerated: true,
        aiQuestionType: "community",
        firstAnswerRewardMultiplier: 3.0,
        messages: {
          create: { role: "user", content: q.question, orderIndex: 0 },
        },
      },
    });
  }
  console.log(`✅ AI 생성 질문 ${aiQuestions.length}개 생성 (커뮤니티)`);

  console.log("\n🎉 범퍼 제조업 시드 데이터 생성 완료!");
  console.log("\n로그인: Demo Account로 '박공장장', '김품질팀장', '이사출기술', '최도장전문', '정설비엔지니어', '한신입사원' 입력");
}

// ── Helper functions ──

async function upsertUser(name: string, balance: number, hubScore: number, authorityScore: number) {
  const email = `${name.toLowerCase().replace(/\s+/g, "")}@demo.local`;
  return prisma.user.upsert({
    where: { email },
    update: { balance, hubScore, authorityScore },
    create: { name, email, balance, hubScore, authorityScore, trustLevel: 2 },
  });
}

async function upsertTag(name: string) {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return prisma.tag.upsert({
    where: { slug },
    update: {},
    create: { name, slug },
  });
}

async function createQASet(params: {
  creatorId: string;
  title: string;
  summary: string | null;
  isShared: boolean;
  totalInvested: number;
  investorCount: number;
  qualityPool: number;
  authorityScore: number;
  creatorAuthorityStake: number;
  parentQASetId?: string;
  parentMessageCount?: number;
  searchKeywords?: string;
  tagNames: string[];
  messages: { role: string; content: string; relationSimple: string | null }[];
}) {
  const qaSet = await prisma.qASet.create({
    data: {
      creatorId: params.creatorId,
      title: params.title,
      summary: params.summary,
      isShared: params.isShared,
      sharedAt: params.isShared ? new Date() : null,
      totalInvested: params.totalInvested,
      investorCount: params.investorCount,
      qualityPool: params.qualityPool,
      authorityScore: params.authorityScore,
      creatorAuthorityStake: params.creatorAuthorityStake,
      parentQASetId: params.parentQASetId ?? null,
      parentMessageCount: params.parentMessageCount ?? 0,
      searchKeywords: params.searchKeywords ?? null,
      messages: {
        create: params.messages.map((m, i) => ({
          role: m.role,
          content: m.content,
          relationSimple: m.relationSimple,
          orderIndex: i,
        })),
      },
    },
  });

  for (const tagName of params.tagNames) {
    const slug = tagName.toLowerCase().replace(/\s+/g, "-");
    const tag = await prisma.tag.findUnique({ where: { slug } });
    if (tag) {
      await prisma.qASetTag.create({ data: { qaSetId: qaSet.id, tagId: tag.id } });
      await prisma.tag.update({ where: { id: tag.id }, data: { usageCount: { increment: 1 } } });
    }
  }

  return qaSet;
}

main()
  .catch((e) => {
    console.error("❌ 시드 에러:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
