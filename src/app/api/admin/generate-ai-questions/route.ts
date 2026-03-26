import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { getFilteredTrends } from "@/lib/trends/google-trends";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic();

interface GeneratedQuestion {
  topic: string;
  question: string;
  reason: string; // "왜 이 질문을?" 에 표시될 내용
}

/**
 * POST /api/admin/generate-ai-questions
 *
 * Google Trends 기반으로 AI 질문을 생성합니다.
 *
 * Body:
 * - topics?: string[] - 직접 주제 입력 (없으면 Google Trends에서 자동 수집)
 * - count?: number - 생성할 질문 수 (기본 5개, 최대 10개)
 * - geo?: string - 국가 코드 (기본 KR)
 */
export async function POST(req: NextRequest) {
  const session = await auth();

  // 관리자 체크 (나중에 실제 권한 시스템으로 교체)
  // 지금은 로그인된 사용자면 허용
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const count = Math.min(body.count ?? 5, 10);
    const geo = body.geo ?? "KR";

    // 1. 주제 수집
    let topics: string[];
    if (body.topics && Array.isArray(body.topics) && body.topics.length > 0) {
      topics = body.topics.slice(0, 20);
    } else {
      // Google Trends에서 자동 수집
      topics = await getFilteredTrends(geo, 20);
      if (topics.length === 0) {
        return NextResponse.json({
          error: "No trending topics found",
          message: "Google Trends에서 트렌드를 가져오지 못했습니다. 직접 topics를 입력해주세요.",
        }, { status: 400 });
      }
    }

    // 2. AI로 경험 기반 질문 생성
    const generatedQuestions = await generateExperienceQuestions(topics, count);

    if (generatedQuestions.length === 0) {
      return NextResponse.json({
        error: "Failed to generate questions",
        topics,
      }, { status: 500 });
    }

    // 3. 시스템 AI 사용자 확인/생성
    let systemAI = await prisma.user.findFirst({
      where: { isSystemAI: true },
    });

    if (!systemAI) {
      systemAI = await prisma.user.create({
        data: {
          name: "AI 질문봇",
          email: "ai-question-bot@system.local",
          isSystemAI: true,
          balance: 0,
        },
      });
    }

    // 4. QASet 생성
    const createdQASets = [];

    for (const q of generatedQuestions) {
      const qaSet = await prisma.qASet.create({
        data: {
          title: q.question.slice(0, 100),
          creatorId: systemAI.id,
          isAIGenerated: true,
          aiQuestionType: "trend",
          firstAnswerRewardMultiplier: 3.0, // 첫 답변자 3배 보너스
          isShared: true,
          sharedAt: new Date(),
          summary: q.reason, // "왜 이 질문을?" 표시용
          messages: {
            create: {
              role: "user",
              content: q.question,
              orderIndex: 0,
            },
          },
        },
        include: {
          messages: true,
        },
      });

      createdQASets.push({
        id: qaSet.id,
        topic: q.topic,
        question: q.question,
        reason: q.reason,
      });
    }

    return NextResponse.json({
      success: true,
      topics,
      generated: createdQASets,
      count: createdQASets.length,
    });

  } catch (error) {
    console.error("Failed to generate AI questions:", error);
    return NextResponse.json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}

/**
 * Claude를 사용해 경험 기반 질문 생성
 */
async function generateExperienceQuestions(
  topics: string[],
  count: number
): Promise<GeneratedQuestion[]> {
  const prompt = `당신은 Q&A 플랫폼의 질문 창작자입니다.

## 목표
주어진 트렌드 주제들을 보고, "실제 경험자만 답할 수 있는" 질문을 ${count}개 창작하세요.

## 주제 목록
${topics.map((t, i) => `${i + 1}. ${t}`).join("\n")}

## 질문 생성 원칙
1. **구체적 상황**: 막연한 질문 ❌, 구체적 상황 ✅
   - 나쁜 예: "창업 경험 있으신가요?"
   - 좋은 예: "첫 직원 채용할 때 가장 후회되는 판단이 있으셨나요?"

2. **감정/판단 포함**: 팩트만 묻기 ❌, 경험에서 우러난 판단 ✅
   - 나쁜 예: "이직 시 연봉 협상 어떻게 하셨나요?"
   - 좋은 예: "이직할 때 연봉보다 중요하게 봤어야 했는데 놓친 것이 있나요?"

3. **타겟팅**: "~하신 분?" 형태로 경험자 특정
   - 좋은 예: "3년 이상 프리랜서 하신 분들, 정규직으로 돌아갈 생각 해보셨나요?"

4. **한국어**: 자연스러운 한국어로 작성

## 출력 형식 (JSON 배열)
[
  {
    "topic": "원본 트렌드 주제",
    "question": "생성된 질문",
    "reason": "왜 이 질문을 하는지 (예: '이 주제로 3명이 질문했지만 실제 경험담이 부족해요')"
  }
]

JSON만 출력하세요. 다른 텍스트는 포함하지 마세요.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") {
      console.error("Unexpected response type:", content.type);
      return [];
    }

    // JSON 파싱
    const jsonMatch = content.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("No JSON array found in response:", content.text);
      return [];
    }

    const questions: GeneratedQuestion[] = JSON.parse(jsonMatch[0]);
    return questions.slice(0, count);

  } catch (error) {
    console.error("Failed to generate questions with Claude:", error);
    return [];
  }
}

/**
 * GET /api/admin/generate-ai-questions
 *
 * 현재 Google Trends 주제 미리보기 (생성 없이)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const geo = req.nextUrl.searchParams.get("geo") ?? "KR";

  try {
    const topics = await getFilteredTrends(geo, 20);
    return NextResponse.json({
      geo,
      topics,
      count: topics.length,
      message: topics.length > 0
        ? "POST로 요청하면 이 주제들로 AI 질문이 생성됩니다."
        : "트렌드를 가져오지 못했습니다. Google Trends RSS가 차단되었을 수 있습니다.",
    });
  } catch (error) {
    return NextResponse.json({
      error: "Failed to fetch trends",
      message: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
