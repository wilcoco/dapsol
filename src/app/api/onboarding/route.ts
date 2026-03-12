import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { INITIAL_BALANCE } from "@/lib/constants";

// 온보딩용 범용 질문 세트 (누구나 답할 수 있는 경험 기반 질문)
const ONBOARDING_QUESTIONS: Record<string, { question: string; tags: string[] }[]> = {
  // 카테고리별 질문
  "개발": [
    { question: "코드 리뷰에서 가장 효과적이었던 피드백 방식은 무엇인가요?", tags: ["개발", "협업"] },
    { question: "새로운 기술 스택을 도입할 때 팀을 어떻게 설득하셨나요?", tags: ["개발", "리더십"] },
  ],
  "마케팅": [
    { question: "가장 적은 비용으로 큰 효과를 낸 마케팅 사례가 있나요?", tags: ["마케팅", "효율"] },
    { question: "고객 피드백을 제품 개선에 반영한 구체적인 경험이 있나요?", tags: ["마케팅", "제품"] },
  ],
  "디자인": [
    { question: "사용자 테스트에서 예상과 완전히 다른 결과가 나온 적이 있나요?", tags: ["디자인", "UX"] },
    { question: "디자인 시스템을 도입하면서 겪은 가장 큰 어려움은?", tags: ["디자인", "시스템"] },
  ],
  "경영/전략": [
    { question: "팀의 성과를 가장 크게 끌어올린 제도나 문화 변화는?", tags: ["경영", "문화"] },
    { question: "실패한 프로젝트에서 얻은 가장 값진 교훈은 무엇인가요?", tags: ["경영", "교훈"] },
  ],
  "데이터": [
    { question: "데이터 분석 결과가 직감과 완전히 반대였던 경험이 있나요?", tags: ["데이터", "인사이트"] },
    { question: "비전문가에게 데이터 분석 결과를 설명할 때 가장 효과적인 방법은?", tags: ["데이터", "커뮤니케이션"] },
  ],
  "일반": [
    { question: "업무에서 가장 시간을 아껴준 도구나 방법은 무엇인가요?", tags: ["생산성", "업무"] },
    { question: "AI를 실무에 활용해본 경험 중 가장 인상적이었던 것은?", tags: ["AI", "업무"] },
    { question: "새로운 팀에 합류했을 때 빠르게 적응한 본인만의 방법이 있나요?", tags: ["협업", "적응"] },
  ],
};

const ONBOARDING_BONUS = 50;

// GET: 관심 분야에 맞는 온보딩 질문 반환
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const interestsParam = searchParams.get("interests"); // comma-separated

  let questions: { question: string; tags: string[] }[] = [];

  if (interestsParam) {
    const interests = interestsParam.split(",").map(s => s.trim());
    // 관심 분야별 질문 수집
    for (const interest of interests) {
      const categoryQuestions = ONBOARDING_QUESTIONS[interest];
      if (categoryQuestions) {
        questions.push(...categoryQuestions);
      }
    }
  }

  // 관심 분야 질문이 부족하면 일반 질문으로 보충
  if (questions.length < 3) {
    questions.push(...ONBOARDING_QUESTIONS["일반"]);
  }

  // 셔플 후 최대 5개
  questions = questions.sort(() => Math.random() - 0.5).slice(0, 5);

  return NextResponse.json({
    questions,
    categories: Object.keys(ONBOARDING_QUESTIONS).filter(k => k !== "일반"),
  });
}

// POST: 온보딩 답변 제출 + 보너스 크레딧 지급
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, answer, interests } = await req.json();

  if (!question?.trim() || !answer?.trim()) {
    return NextResponse.json({ error: "질문과 답변이 필요합니다." }, { status: 400 });
  }

  // 1. 관심 분야 저장
  if (interests?.length > 0) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { interestTags: JSON.stringify(interests) },
    });
  }

  // 2. QASet 생성 + 질문 메시지 + 인간 답변
  const qaSet = await prisma.qASet.create({
    data: {
      title: question,
      creatorId: session.user.id,
      messages: {
        create: [
          { role: "user", content: question, orderIndex: 0 },
          {
            role: "assistant",
            content: answer.trim(),
            orderIndex: 1,
            isGapResponse: true,
            isInsight: true,
            insightReason: "온보딩 중 사용자가 직접 작성한 답변",
          },
        ],
      },
    },
  });

  // 3. 온보딩 완료 + 보너스 크레딧 지급
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      onboardingCompleted: true,
      balance: { increment: ONBOARDING_BONUS },
    },
  });

  // 4. 같은 질문에 다른 사람의 답변 가져오기 (소셜 증거)
  const otherAnswers = await prisma.qASet.findMany({
    where: {
      title: question,
      creatorId: { not: session.user.id },
      isShared: true,
    },
    take: 2,
    include: {
      creator: { select: { name: true } },
      messages: {
        where: { role: "assistant", isGapResponse: true },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    qaSetId: qaSet.id,
    bonusAmount: ONBOARDING_BONUS,
    otherAnswers: otherAnswers.map(qa => ({
      creatorName: qa.creator?.name ?? "익명",
      preview: qa.messages[0]?.content?.slice(0, 100) ?? "",
    })),
  });
}

// PATCH: 온보딩 건너뛰기
export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingCompleted: true },
  });

  return NextResponse.json({ ok: true });
}
