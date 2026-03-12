/**
 * 샘플 데이터 시드 스크립트
 *
 * 실행: npx tsx prisma/seed.ts
 *
 * 생성되는 데이터:
 * - 사용자 5명 (데모 계정)
 * - Q&A 6개 (공유됨, 다양한 주제)
 * - 포크/확장 Q&A 1개
 * - 투자 내역 10건+
 * - 태그 8개
 * - NodeRelation (QA간 관계) 5개
 * - TopicCluster 3개
 * - ClusterRelation 2개
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 시드 데이터 생성 시작...\n");

  // ── 1. 사용자 5명 ──
  const users = await Promise.all([
    upsertUser("김민수", 10000, 1.2, 130),
    upsertUser("이서연", 8500, 1.5, 180),
    upsertUser("박지훈", 12000, 0.9, 100),
    upsertUser("최유나", 9200, 1.8, 220),
    upsertUser("정도현", 7000, 1.0, 100),
  ]);
  const [minsu, seoyeon, jihun, yuna, dohyun] = users;
  console.log(`✅ 사용자 ${users.length}명 생성`);

  // ── 2. 태그 ──
  const tags = await Promise.all([
    upsertTag("AI"),
    upsertTag("경제학"),
    upsertTag("철학"),
    upsertTag("프로그래밍"),
    upsertTag("심리학"),
    upsertTag("역사"),
    upsertTag("과학"),
    upsertTag("경영"),
  ]);
  console.log(`✅ 태그 ${tags.length}개 생성`);

  // ── 3. Q&A 세트 + 메시지 ──

  // QA1: AI와 창의성 (김민수)
  const qa1 = await createQASet({
    creatorId: minsu.id,
    title: "AI가 인간의 창의성을 대체할 수 있을까?",
    summary: "AI의 창의성 한계와 인간 고유 능력에 대한 깊은 논의",
    isShared: true,
    totalInvested: 450,
    investorCount: 4,
    qualityPool: 200,
    authorityScore: 3.2,
    creatorAuthorityStake: 130,
    searchKeywords: "AI, 인공지능, 창의성, 창작, 예술, 음악, 그림, 인간 고유, 의도성, 자기인식, 증강 창의성, Artificial Intelligence, Creativity, Art, Human, Augmented Creativity, Machine Learning",
    tagNames: ["AI", "철학", "심리학"],
    messages: [
      { role: "user", content: "AI가 정말로 인간의 창의성을 대체할 수 있을까요? 최근 AI가 그림도 그리고 음악도 작곡하는데, 이게 진짜 '창의적'이라고 할 수 있나요?", relationSimple: null },
      { role: "assistant", content: "흥미로운 질문입니다. AI의 '창의성'은 본질적으로 기존 데이터의 패턴 재조합입니다. 인간 창의성과 구분해야 할 핵심 차이점들이 있습니다:\n\n1. **의도성**: 인간은 감정, 경험, 목적을 가지고 창작합니다. AI는 통계적 확률을 따릅니다.\n2. **맥락 이해**: 인간은 사회적, 문화적 맥락 속에서 의미를 만들어냅니다.\n3. **자기 인식**: 인간 예술가는 자신의 작품에 대해 비판적으로 성찰할 수 있습니다.\n\n다만, 도구로서의 AI는 인간의 창의적 과정을 크게 확장할 수 있습니다.", relationSimple: null },
      { role: "user", content: "그런데 인간 창의성도 결국 기존 경험의 재조합 아닌가요? 뉴턴도 '거인의 어깨 위에 서 있다'고 했잖아요.", relationSimple: "반박" },
      { role: "assistant", content: "날카로운 지적입니다. 실제로 인간 창의성도 완전한 무에서의 창조는 아닙니다. 마가렛 보든은 창의성을 세 가지로 분류했습니다:\n\n1. **탐색적 창의성**: 기존 규칙 내에서 새로운 가능성 발견 — AI도 가능\n2. **조합적 창의성**: 서로 다른 영역의 아이디어 연결 — AI가 부분적으로 가능\n3. **변혁적 창의성**: 기존 규칙 자체를 바꾸는 것 — 현재 AI에겐 매우 어려움\n\n핵심 차이는 '왜' 새로운 것을 만드는가에 있습니다. 인간에겐 실존적 동기가 있습니다.", relationSimple: null },
      { role: "user", content: "그러면 결론적으로 AI와 인간이 협업하는 형태가 가장 이상적인 건가요?", relationSimple: "정리" },
      { role: "assistant", content: "네, 현재로서는 '증강 창의성(Augmented Creativity)' 모델이 가장 유망합니다:\n\n- **AI 역할**: 대량의 변형 생성, 패턴 발견, 기술적 실행 보조\n- **인간 역할**: 방향 설정, 의미 부여, 윤리적 판단, 감정적 깊이\n\n실제로 AI를 도구로 활용하는 예술가들이 이전보다 더 많은 실험을 할 수 있게 되었다는 연구 결과도 있습니다. 핵심은 AI를 '대체자'가 아닌 '확장자'로 보는 관점입니다.", relationSimple: null },
    ],
  });

  // QA2: 행동경제학 (이서연)
  const qa2 = await createQASet({
    creatorId: seoyeon.id,
    title: "넛지 이론이 실제 정책에 어떻게 적용되나요?",
    summary: "리처드 탈러의 넛지 이론과 실제 정책 사례 분석",
    isShared: true,
    totalInvested: 320,
    investorCount: 3,
    qualityPool: 150,
    authorityScore: 2.8,
    creatorAuthorityStake: 180,
    searchKeywords: "넛지, 행동경제학, 리처드 탈러, 선택 설계, 정책, 장기기증, 연금, 온정주의, 파터널리즘, 의사결정, Nudge, Behavioral Economics, Richard Thaler, Choice Architecture, Policy, Opt-out, Default, Paternalism",
    tagNames: ["경제학", "심리학"],
    messages: [
      { role: "user", content: "넛지 이론이 실제로 정부 정책에 적용된 사례가 있나요? 이론과 실제의 차이가 궁금합니다.", relationSimple: null },
      { role: "assistant", content: "넛지 이론은 2008년 리처드 탈러와 캐스 선스타인이 제시한 개념으로, 강제가 아닌 부드러운 개입으로 더 나은 선택을 유도합니다. 대표적 적용 사례:\n\n1. **영국 행동통찰팀(BIT)**: 세금 납부 독촉장에 '당신 지역의 90%가 이미 납부했습니다' 문구 → 납부율 15% 상승\n2. **장기 기증 옵트아웃**: 스페인, 오스트리아 등은 기본적으로 장기 기증에 동의된 상태 → 기증률 80%+ (미국 28%)\n3. **카페테리아 건강식**: 눈높이에 과일 배치 → 건강식 선택 25% 증가\n4. **연금 자동 가입**: 미국 401(k) 자동 가입 → 가입률 50%에서 90%로\n\n이론과 실제의 차이는 주로 문화적 맥락에서 발생합니다.", relationSimple: null },
      { role: "user", content: "넛지가 조작이나 파터널리즘이라는 비판도 있지 않나요?", relationSimple: "반박" },
      { role: "assistant", content: "맞습니다. 이것은 넛지 이론의 가장 핵심적인 논쟁점입니다:\n\n**비판 측:**\n- '자유주의적 온정주의'라지만, 결국 엘리트가 대중의 선택을 조종하는 것\n- 투명하지 않은 넛지는 민주주의적 동의 없이 작동\n- 기업이 '다크 넛지'로 악용 (예: 구독 해지를 어렵게 만들기)\n\n**옹호 측:**\n- 어떤 선택 설계든 중립은 불가능 — 디폴트는 항상 존재\n- 선택의 자유는 보장됨 (옵트아웃 가능)\n- 규제보다 비용이 적고 자유를 덜 침해\n\n핵심은 **투명성과 옵트아웃 보장**입니다.", relationSimple: null },
    ],
  });

  // QA3: 프로그래밍 패러다임 (박지훈)
  const qa3 = await createQASet({
    creatorId: jihun.id,
    title: "함수형 프로그래밍 vs 객체지향 프로그래밍, 언제 뭘 써야 하나?",
    summary: "실무에서의 패러다임 선택 기준",
    isShared: true,
    totalInvested: 280,
    investorCount: 3,
    qualityPool: 120,
    authorityScore: 2.1,
    creatorAuthorityStake: 100,
    searchKeywords: "함수형 프로그래밍, 객체지향, FP, OOP, 패러다임, React, 순수함수, 불변성, 상태관리, 디자인패턴, Functional Programming, Object Oriented, Paradigm, Immutability, Pure Function, TypeScript, Kotlin",
    tagNames: ["프로그래밍", "AI"],
    messages: [
      { role: "user", content: "함수형 프로그래밍(FP)과 객체지향 프로그래밍(OOP) 중 어떤 상황에서 어떤 것을 선택해야 하나요? 실무 경험 기반으로 알려주세요.", relationSimple: null },
      { role: "assistant", content: "두 패러다임은 상호 배타적이지 않습니다. 현대 언어들(Kotlin, Swift, TypeScript)은 둘 다 지원합니다.\n\n**OOP가 유리한 경우:**\n- 복잡한 도메인 모델링 (e-commerce, ERP)\n- 상태를 가진 엔티티 관리\n- 큰 팀에서의 역할 분리\n- GUI/게임 개발\n\n**FP가 유리한 경우:**\n- 데이터 변환 파이프라인 (ETL, 스트림 처리)\n- 동시성/병렬 처리 (불변성이 핵심)\n- 수학적 계산, 금융 모델링\n- 테스트 용이성이 중요할 때\n\n**실무 조언:** 대부분의 프로젝트에서는 혼합해서 사용합니다. 도메인 모델은 OOP, 데이터 처리 로직은 FP 스타일이 효과적입니다.", relationSimple: null },
      { role: "user", content: "React에서 함수형 컴포넌트를 쓰는 것도 FP인가요?", relationSimple: "명확화" },
      { role: "assistant", content: "부분적으로 맞습니다. React 함수형 컴포넌트는 FP의 일부 개념을 차용합니다:\n\n**FP적인 부분:**\n- 순수 함수로서의 컴포넌트 (같은 props → 같은 UI)\n- 불변 상태 (setState는 새 값을 반환)\n- 함수 합성 (HOC, 커스텀 훅)\n\n**FP적이지 않은 부분:**\n- useState, useEffect는 사실상 부수효과\n- useRef는 가변 참조\n- 컴포넌트 라이프사이클은 암묵적 상태\n\n엄밀한 FP(Haskell 등)와는 다르지만, 'FP 영감을 받은 설계'라고 볼 수 있습니다.", relationSimple: null },
    ],
  });

  // QA4: 역사와 반복 (최유나)
  const qa4 = await createQASet({
    creatorId: yuna.id,
    title: "역사는 정말로 반복되는가? 패턴 인식의 함정",
    summary: "역사적 유사성과 차이를 구분하는 프레임워크",
    isShared: true,
    totalInvested: 180,
    investorCount: 2,
    qualityPool: 80,
    authorityScore: 1.5,
    creatorAuthorityStake: 220,
    searchKeywords: "역사, 반복, 패턴, 제국, 흥망, 경제 거품, 유사성 편향, 마크 트웨인, 사후 합리화, 인간 심리, History, Pattern, Empire, Cycle, Bias, Rationalization, Repetition",
    tagNames: ["역사", "철학"],
    messages: [
      { role: "user", content: "'역사는 반복된다'는 말이 있는데, 실제로 역사적 사건들에서 반복되는 패턴이 존재하나요?", relationSimple: null },
      { role: "assistant", content: "마크 트웨인이 말했듯이, '역사는 반복되지 않지만, 운율을 맞춘다'가 더 정확합니다.\n\n**반복처럼 보이는 패턴:**\n- 제국의 흥망 사이클 (로마 → 오스만 → 대영제국)\n- 경제 거품과 붕괴 (튤립 → 닷컴 → 서브프라임)\n- 기술 혁명 후 사회 저항 (산업혁명 러다이트 → AI 불안)\n\n**하지만 주의할 점:**\n1. 유사성 편향: 인간은 패턴을 과도하게 찾으려 함\n2. 맥락 무시: 같은 '구조'도 완전히 다른 결과를 낳음\n3. 사후 합리화: 결과를 알고 나서 패턴을 '발견'함\n\n역사에서 배울 점은 구체적 사건의 반복이 아니라, 인간 심리와 구조적 동학의 유사성입니다.", relationSimple: null },
    ],
  });

  // QA5: 양자컴퓨팅 (정도현)
  const qa5 = await createQASet({
    creatorId: dohyun.id,
    title: "양자컴퓨터가 현재 암호화를 깨뜨릴 수 있나요?",
    summary: "양자 위협의 실체와 포스트 양자 암호학",
    isShared: true,
    totalInvested: 150,
    investorCount: 2,
    qualityPool: 60,
    authorityScore: 1.2,
    creatorAuthorityStake: 100,
    searchKeywords: "양자컴퓨터, 양자컴퓨팅, RSA, 암호화, 쇼어 알고리즘, 큐비트, 포스트 양자, 비트코인, 보안, NIST, Quantum Computer, Encryption, Shor Algorithm, Qubit, Post-Quantum, Cryptography, Bitcoin, Security",
    tagNames: ["과학", "프로그래밍"],
    messages: [
      { role: "user", content: "양자컴퓨터가 현재 사용하는 RSA 같은 암호화를 정말 깨뜨릴 수 있나요? 언제쯤 가능한가요?", relationSimple: null },
      { role: "assistant", content: "이론적으로는 가능하지만, 실제로는 아직 멀었습니다.\n\n**이론적 배경:**\n- 쇼어 알고리즘으로 RSA, ECC 등 공개키 암호를 다항시간에 해독 가능\n- 현재 RSA-2048 해독에 필요한 논리 큐비트: 약 4,000개\n\n**현재 상황 (2025년):**\n- IBM의 최대 양자컴퓨터: 약 1,200 물리 큐비트\n- 에러율이 높아 실용적 계산은 수백 큐비트 수준\n- RSA 해독은 최소 100만 물리 큐비트 필요 (에러 정정 포함)\n\n**대응책:**\n- NIST가 2024년 포스트 양자 암호 표준 발표 (CRYSTALS-Kyber, CRYSTALS-Dilithium)\n- 격자 기반 암호는 양자컴퓨터로도 해독 어려움\n- 전문가 추정: 실질적 위협은 2035~2040년경\n\n'Y2Q' (Years to Quantum) 문제라고 불리며, 지금부터 준비해야 합니다.", relationSimple: null },
      { role: "user", content: "그러면 비트코인은 양자컴퓨터에 취약한가요?", relationSimple: "적용" },
      { role: "assistant", content: "비트코인은 이중 보호 구조를 가지고 있습니다:\n\n**취약한 부분:**\n- ECDSA 서명 (공개키 → 개인키 역산 가능)\n- 특히 공개키가 노출된 주소 (재사용 주소)가 위험\n\n**비교적 안전한 부분:**\n- SHA-256 해시는 양자에도 강건 (그로버 알고리즘으로 보안 절반 감소, 128비트→64비트이나 여전히 충분)\n- 한 번만 사용하고 잔액을 새 주소로 보내면 공개키 미노출\n\n**비트코인 커뮤니티 대응:**\n- 포스트 양자 서명 도입 논의 중 (BIP 제안)\n- 전환까지 시간이 있어 소프트포크로 업그레이드 가능\n\n결론적으로, 양자 위협이 현실화되기 전에 업그레이드될 가능성이 높습니다.", relationSimple: null },
    ],
  });

  // QA6: 조직 관리 (이서연)
  const qa6 = await createQASet({
    creatorId: seoyeon.id,
    title: "심리적 안전감이 팀 성과에 미치는 영향",
    summary: "구글의 아리스토텔레스 프로젝트와 심리적 안전감 연구",
    isShared: true,
    totalInvested: 200,
    investorCount: 2,
    qualityPool: 90,
    authorityScore: 1.8,
    creatorAuthorityStake: 180,
    searchKeywords: "심리적 안전감, 구글, 아리스토텔레스, 팀 성과, 조직문화, 에이미 에드몬슨, 혁신, 몰입, 이직률, 고성과팀, Psychological Safety, Google, Aristotle, Team Performance, Innovation, Amy Edmondson, Culture, Engagement",
    tagNames: ["경영", "심리학"],
    messages: [
      { role: "user", content: "구글의 아리스토텔레스 프로젝트에서 발견한 '심리적 안전감'이 왜 그렇게 중요한가요?", relationSimple: null },
      { role: "assistant", content: "구글은 2012~2015년 180개 팀을 분석해 고성과 팀의 5가지 핵심 요소를 발견했습니다. 그 중 가장 중요한 것이 **심리적 안전감**이었습니다.\n\n**심리적 안전감이란:**\n- 팀 내에서 실수, 질문, 반대 의견을 표현해도 처벌받지 않을 것이라는 믿음\n- 에이미 에드몬슨(하버드) 교수가 1999년 처음 학술적으로 정의\n\n**왜 중요한가:**\n1. **학습 속도**: 실수를 숨기지 않으면 빠르게 개선\n2. **혁신 촉진**: 엉뚱한 아이디어도 제안 가능\n3. **정보 공유**: 나쁜 소식도 빠르게 전달\n4. **몰입도**: 에너지를 방어가 아닌 업무에 집중\n\n구글 데이터에 따르면, 심리적 안전감이 높은 팀은 이직률이 낮고, 매출 목표 초과 달성률이 2배였습니다.", relationSimple: null },
    ],
  });

  console.log(`✅ Q&A ${6}개 생성 (메시지 포함)`);

  // ── 4. 포크/확장 Q&A ──
  const qa1Fork = await createQASet({
    creatorId: jihun.id,
    title: "AI가 인간의 창의성을 대체할 수 있을까?",
    summary: null,
    isShared: true,
    totalInvested: 80,
    investorCount: 1,
    qualityPool: 40,
    authorityScore: 0.5,
    creatorAuthorityStake: 100,
    parentQASetId: qa1.id,
    parentMessageCount: 4, // 부모의 첫 4개 메시지 복사
    searchKeywords: "AI, 코드, 창의성, GitHub Copilot, 프로그래밍, 개발자, 디자인패턴, 알고리즘, AI Code, Creativity, Developer, Programming, Copilot",
    tagNames: ["AI", "프로그래밍"],
    messages: [
      // 복사된 부모 메시지 (4개)
      { role: "user", content: "AI가 정말로 인간의 창의성을 대체할 수 있을까요? 최근 AI가 그림도 그리고 음악도 작곡하는데, 이게 진짜 '창의적'이라고 할 수 있나요?", relationSimple: null },
      { role: "assistant", content: "흥미로운 질문입니다. AI의 '창의성'은 본질적으로 기존 데이터의 패턴 재조합입니다. 인간 창의성과 구분해야 할 핵심 차이점들이 있습니다:\n\n1. **의도성**: 인간은 감정, 경험, 목적을 가지고 창작합니다. AI는 통계적 확률을 따릅니다.\n2. **맥락 이해**: 인간은 사회적, 문화적 맥락 속에서 의미를 만들어냅니다.\n3. **자기 인식**: 인간 예술가는 자신의 작품에 대해 비판적으로 성찰할 수 있습니다.\n\n다만, 도구로서의 AI는 인간의 창의적 과정을 크게 확장할 수 있습니다.", relationSimple: null },
      { role: "user", content: "그런데 인간 창의성도 결국 기존 경험의 재조합 아닌가요? 뉴턴도 '거인의 어깨 위에 서 있다'고 했잖아요.", relationSimple: "반박" },
      { role: "assistant", content: "날카로운 지적입니다. 실제로 인간 창의성도 완전한 무에서의 창조는 아닙니다. 마가렛 보든은 창의성을 세 가지로 분류했습니다:\n\n1. **탐색적 창의성**: 기존 규칙 내에서 새로운 가능성 발견 — AI도 가능\n2. **조합적 창의성**: 서로 다른 영역의 아이디어 연결 — AI가 부분적으로 가능\n3. **변혁적 창의성**: 기존 규칙 자체를 바꾸는 것 — 현재 AI에겐 매우 어려움\n\n핵심 차이는 '왜' 새로운 것을 만드는가에 있습니다. 인간에겐 실존적 동기가 있습니다.", relationSimple: null },
      // 확장 메시지 (박지훈의 독자적 질문)
      { role: "user", content: "AI가 코드를 작성하는 것도 창의성이라고 볼 수 있나요? 개발자로서 GitHub Copilot을 쓰면서 느끼는 건, AI가 꽤 '창의적인' 해결책을 제시할 때가 있거든요.", relationSimple: "적용" },
      { role: "assistant", content: "프로그래밍 맥락에서 흥미로운 관찰입니다. AI 코드 생성을 분석해보면:\n\n**'창의적'으로 보이는 경우:**\n- 여러 디자인 패턴을 예상치 못한 방식으로 조합\n- 문서에 없는 라이브러리 사용법 발견\n- 엣지 케이스를 예상하는 방어적 코드\n\n**실제로는:**\n- 학습 데이터에서 유사 패턴을 본 적 있는 것\n- 수백만 개의 코드 리포지토리에서의 통계적 최빈값\n- 진짜 새로운 알고리즘을 '발명'하지는 못함\n\n개발자 입장에서 AI는 '매우 빠른 시니어 개발자의 코드 리뷰'에 가깝습니다. 아키텍처 결정이나 비즈니스 로직 설계는 여전히 인간의 영역입니다.", relationSimple: null },
    ],
  });
  console.log(`✅ 포크 Q&A 1개 생성`);

  // ── 5. 투자 내역 ──
  const investments = [
    // QA1 투자자들
    { qaSetId: qa1.id, userId: minsu.id,  amount: 130, position: 1, effectiveAmount: 13.7 },
    { qaSetId: qa1.id, userId: seoyeon.id, amount: 120, position: 2, effectiveAmount: 16.4 },
    { qaSetId: qa1.id, userId: yuna.id,   amount: 100, position: 3, effectiveAmount: 18.0 },
    { qaSetId: qa1.id, userId: dohyun.id, amount: 100, position: 4, effectiveAmount: 10.0 },
    // QA2 투자자들
    { qaSetId: qa2.id, userId: seoyeon.id, amount: 180, position: 1, effectiveAmount: 20.1 },
    { qaSetId: qa2.id, userId: minsu.id,  amount: 80,  position: 2, effectiveAmount: 10.7 },
    { qaSetId: qa2.id, userId: jihun.id,  amount: 60,  position: 3, effectiveAmount: 7.0 },
    // QA3 투자자들
    { qaSetId: qa3.id, userId: jihun.id,  amount: 100, position: 1, effectiveAmount: 9.0 },
    { qaSetId: qa3.id, userId: minsu.id,  amount: 100, position: 2, effectiveAmount: 12.0 },
    { qaSetId: qa3.id, userId: yuna.id,   amount: 80,  position: 3, effectiveAmount: 16.1 },
    // QA4 투자자들
    { qaSetId: qa4.id, userId: yuna.id,   amount: 100, position: 1, effectiveAmount: 18.0 },
    { qaSetId: qa4.id, userId: dohyun.id, amount: 80,  position: 2, effectiveAmount: 8.9 },
    // QA5 투자자들
    { qaSetId: qa5.id, userId: dohyun.id, amount: 100, position: 1, effectiveAmount: 10.0 },
    { qaSetId: qa5.id, userId: minsu.id,  amount: 50,  position: 2, effectiveAmount: 8.5 },
    // QA6 투자자들
    { qaSetId: qa6.id, userId: seoyeon.id, amount: 100, position: 1, effectiveAmount: 15.0 },
    { qaSetId: qa6.id, userId: yuna.id,   amount: 100, position: 2, effectiveAmount: 18.0 },
    // Fork QA 투자자
    { qaSetId: qa1Fork.id, userId: jihun.id, amount: 80, position: 1, effectiveAmount: 8.0 },
  ];

  for (const inv of investments) {
    await prisma.investment.create({ data: inv });
  }
  console.log(`✅ 투자 ${investments.length}건 생성`);

  // ── 6. 토픽 클러스터 ──
  const cluster1 = await prisma.topicCluster.create({
    data: {
      name: "AI와 인간 능력",
      nameEn: "AI and Human Capabilities",
      description: "AI의 한계와 인간 고유 능력에 대한 논의",
    },
  });
  const cluster2 = await prisma.topicCluster.create({
    data: {
      name: "행동과학과 의사결정",
      nameEn: "Behavioral Science and Decision Making",
      description: "인간 행동, 심리, 의사결정에 관한 주제",
    },
  });
  const cluster3 = await prisma.topicCluster.create({
    data: {
      name: "기술과 보안",
      nameEn: "Technology and Security",
      description: "프로그래밍, 암호화, 보안 기술 관련",
    },
  });

  // QA를 클러스터에 할당
  await prisma.qASet.update({ where: { id: qa1.id }, data: { topicClusterId: cluster1.id } });
  await prisma.qASet.update({ where: { id: qa1Fork.id }, data: { topicClusterId: cluster1.id } });
  await prisma.qASet.update({ where: { id: qa2.id }, data: { topicClusterId: cluster2.id } });
  await prisma.qASet.update({ where: { id: qa4.id }, data: { topicClusterId: cluster2.id } });
  await prisma.qASet.update({ where: { id: qa6.id }, data: { topicClusterId: cluster2.id } });
  await prisma.qASet.update({ where: { id: qa3.id }, data: { topicClusterId: cluster3.id } });
  await prisma.qASet.update({ where: { id: qa5.id }, data: { topicClusterId: cluster3.id } });

  console.log(`✅ 토픽 클러스터 3개 생성 + Q&A 할당`);

  // ── 7. NodeRelation (QA 간 관계) ──
  const relations = [
    { sourceQASetId: qa1.id, targetQASetId: qa3.id, relationType: "elaboration" },     // AI 창의성 → 프로그래밍 패러다임
    { sourceQASetId: qa2.id, targetQASetId: qa6.id, relationType: "evidence" },        // 넛지 → 심리적 안전감 (근거)
    { sourceQASetId: qa4.id, targetQASetId: qa2.id, relationType: "analogy" },         // 역사 반복 → 넛지 (유추)
    { sourceQASetId: qa3.id, targetQASetId: qa5.id, relationType: "extension" },       // 프로그래밍 → 양자컴퓨팅 (확장)
    { sourceQASetId: qa1.id, targetQASetId: qa4.id, relationType: "counterargument" }, // AI 창의성 vs 역사 반복
  ];

  for (const rel of relations) {
    await prisma.nodeRelation.create({ data: { ...rel, isAIGenerated: true } });
  }
  console.log(`✅ NodeRelation ${relations.length}개 생성`);

  // ── 8. ClusterRelation (클러스터 간 관계, 레벨 2: SKOS 기반 4종) ──
  await prisma.clusterRelation.create({
    data: {
      sourceClusterId: cluster1.id,
      targetClusterId: cluster3.id,
      relationType: "narrower",
      weight: 2,
      label: "하위",
    },
  });
  await prisma.clusterRelation.create({
    data: {
      sourceClusterId: cluster2.id,
      targetClusterId: cluster1.id,
      relationType: "conflicting",
      weight: 1,
      label: "대립",
    },
  });
  await prisma.clusterRelation.create({
    data: {
      sourceClusterId: cluster3.id,
      targetClusterId: cluster2.id,
      relationType: "related",
      weight: 1.5,
      label: "관련",
    },
  });
  console.log(`✅ ClusterRelation 3개 생성 (레벨 2: broader/narrower/related/conflicting)`);

  // ── 8.5 KnowledgeGap (지식 갭 — AI가 인간에게 묻는 영역) ──
  const gapData = [
    {
      topicClusterId: cluster1.id,
      gapType: "uncertain_answer",
      description: "AI가 변혁적 창의성(기존 패러다임을 깨는 수준)을 달성할 수 있는 시점에 대한 구체적 근거가 부족합니다. 실제 예술/과학 분야 종사자의 경험적 판단이 필요합니다.",
      affectedQASetIds: JSON.stringify([qa1.id, qa1Fork.id]),
      severity: "high",
    },
    {
      topicClusterId: cluster1.id,
      gapType: "missing_evidence",
      description: "AI 보조 창작(증강 창의성)이 실제 업무 현장에서 생산성을 얼마나 높이는지 정량적 데이터가 없습니다.",
      affectedQASetIds: JSON.stringify([qa1.id]),
      severity: "medium",
    },
    {
      topicClusterId: cluster2.id,
      gapType: "inconsistency",
      description: "넛지의 효과성에 대해 Q&A들이 서로 다른 결론을 제시합니다. 실제 조직에서 넛지를 적용해본 경험이 있는 분의 사례가 필요합니다.",
      affectedQASetIds: JSON.stringify([qa2.id, qa4.id]),
      severity: "medium",
    },
    {
      topicClusterId: cluster2.id,
      gapType: "conflicting_claims",
      description: "심리적 안전감이 높으면 성과가 낮아진다는 반론과, 오히려 혁신을 촉진한다는 주장이 공존합니다. 팀 리더로서 직접 경험한 분의 의견이 필요합니다.",
      affectedQASetIds: JSON.stringify([qa6.id]),
      severity: "high",
    },
    {
      topicClusterId: cluster3.id,
      gapType: "uncertain_answer",
      description: "양자컴퓨터의 실질적 보안 위협 시점(2035~2040)에 대한 근거가 불확실합니다. 양자컴퓨팅 또는 암호학 분야 전문가의 견해가 필요합니다.",
      affectedQASetIds: JSON.stringify([qa5.id]),
      severity: "high",
    },
  ];

  await prisma.knowledgeGap.createMany({ data: gapData });
  console.log(`✅ KnowledgeGap ${gapData.length}개 생성 (AI가 인간에게 묻는 영역)`);

  // ── 9. 알림 샘플 ──
  await prisma.notification.createMany({
    data: [
      { userId: minsu.id, type: "investment_received", title: "투자 알림", body: "이서연님이 'AI가 인간의 창의성을 대체할 수 있을까?'에 120💎 투자했습니다.", link: `/?qaSetId=${qa1.id}` },
      { userId: seoyeon.id, type: "reward_earned", title: "보상 획득", body: "최유나님의 투자로 50💎 보상을 받았습니다.", link: `/?qaSetId=${qa1.id}` },
      { userId: jihun.id, type: "milestone", title: "마일스톤 달성", body: "'함수형 vs 객체지향' Q&A가 투자자 3명을 달성했습니다! 품질 풀 해제.", link: `/?qaSetId=${qa3.id}` },
    ],
  });
  console.log(`✅ 알림 3개 생성`);

  console.log("\n🎉 시드 데이터 생성 완료!");
  console.log("\n로그인 방법: Demo Account로 '김민수', '이서연', '박지훈', '최유나', '정도현' 중 하나를 입력하세요.");
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

  // 태그 연결
  for (const tagName of params.tagNames) {
    const slug = tagName.toLowerCase().replace(/\s+/g, "-");
    const tag = await prisma.tag.findUnique({ where: { slug } });
    if (tag) {
      await prisma.qASetTag.create({
        data: { qaSetId: qaSet.id, tagId: tag.id },
      });
      await prisma.tag.update({
        where: { id: tag.id },
        data: { usageCount: { increment: 1 } },
      });
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
