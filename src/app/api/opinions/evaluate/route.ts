import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSystemAIUser } from "@/lib/system-user";

const anthropic = new Anthropic();

// AI 빈틈 유형 한글 매핑
const GAP_TYPE_LABELS: Record<string, string> = {
  wrong_info: "틀린 정보",
  outdated: "최신 아님",
  made_up: "없는 얘기 (AI 날조)",
  reality_differs: "현실은 다름",
  missing_key: "중요한 게 빠짐",
  ai_doesnt_know: "AI도 모르는 영역",
  local_info: "로컬/현장 정보",
  experience: "실제 경험담",
  other: "기타",
};

interface EvaluationResult {
  isValid: boolean;
  accuracy: number;      // 0-100: 수정의 정확도
  significance: number;  // 0-100: 기여의 중요도
  reasoning: string;     // 평가 이유
  suggestedReward: number; // 0-100: 추천 보상
  aiComment: string;     // AI의 인정/피드백 메시지
}

// POST /api/opinions/evaluate
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    originalQuestion,
    originalAnswer,
    gapType,
    userCorrection,
    opinionId,
    qaSetId,
  } = await req.json();

  if (!originalAnswer || !gapType || !userCorrection) {
    return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
  }

  const gapTypeLabel = GAP_TYPE_LABELS[gapType] || gapType;

  try {
    // AI에게 평가 요청
    const evaluationPrompt = `당신은 AI 답변 품질 평가자입니다.

사용자가 당신의 이전 답변에 대해 수정/보완을 제안했습니다. 이 수정이 타당한지 평가해주세요.

## 원래 질문
${originalQuestion || "(질문 정보 없음)"}

## 당신의 원래 답변
${originalAnswer}

## 사용자의 지적
- 빈틈 유형: ${gapTypeLabel}
- 수정 내용: ${userCorrection}

## 평가 기준
1. **정확성 (accuracy)**: 사용자의 수정이 사실에 기반한가? (0-100)
2. **중요도 (significance)**: 이 수정이 답변의 질을 얼마나 개선하는가? (0-100)
3. **타당성 (isValid)**: 전체적으로 이 수정을 인정할 수 있는가? (true/false)

## 빈틈 유형별 평가 포인트
- 틀린 정보: 사용자가 제시한 정보가 정확한지
- 최신 아님: 더 최신 정보인지 확인 가능한지
- 로컬/현장 정보: AI가 알기 어려운 현지 정보인지
- 실제 경험담: 직접 경험에서 나온 인사이트인지

다음 JSON 형식으로만 응답하세요:
{
  "isValid": true/false,
  "accuracy": 0-100,
  "significance": 0-100,
  "reasoning": "평가 이유 (2-3문장)",
  "suggestedReward": 0-100,
  "aiComment": "사용자에게 보여줄 인정/피드백 메시지 (1-2문장, 친근하게)"
}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: evaluationPrompt }],
    });

    // 응답 파싱
    const responseText = response.content[0].type === "text" ? response.content[0].text : "";

    let evaluation: EvaluationResult;
    try {
      // JSON 추출 (```json ... ``` 형태일 수 있음)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON not found");
      evaluation = JSON.parse(jsonMatch[0]);
    } catch {
      // 파싱 실패 시 기본값
      evaluation = {
        isValid: true,
        accuracy: 70,
        significance: 60,
        reasoning: "평가를 완료했습니다.",
        suggestedReward: 30,
        aiComment: "좋은 정보 감사합니다!",
      };
    }

    // 보상 계산 (정확도와 중요도의 가중 평균)
    const calculatedReward = Math.round(
      (evaluation.accuracy * 0.4 + evaluation.significance * 0.6) * 0.5
    );
    evaluation.suggestedReward = Math.max(10, Math.min(50, calculatedReward));

    // 유효한 수정이고 opinionId가 있으면 시스템 투자 실행
    let systemInvestment = null;
    if (evaluation.isValid && evaluation.suggestedReward > 0 && opinionId) {
      const systemUser = await getSystemAIUser();

      // 기존 시스템 투자 확인
      const existingInvestment = await prisma.investment.findFirst({
        where: {
          opinionNodeId: opinionId,
          userId: systemUser.id,
        },
      });

      if (!existingInvestment) {
        // 시스템 계정으로 의견에 투자
        const investmentCount = await prisma.investment.count({
          where: { opinionNodeId: opinionId },
        });

        systemInvestment = await prisma.investment.create({
          data: {
            opinionNodeId: opinionId,
            userId: systemUser.id,
            amount: evaluation.suggestedReward,
            position: investmentCount + 1,
            effectiveAmount: evaluation.suggestedReward,
            comment: `AI 평가: ${evaluation.reasoning.slice(0, 50)}`,
          },
        });

        // 사용자에게 보상 지급 (AI 투자액만큼)
        await prisma.user.update({
          where: { id: session.user.id },
          data: { balance: { increment: evaluation.suggestedReward } },
        });
      }
    }

    return NextResponse.json({
      evaluation,
      systemInvestment: systemInvestment ? {
        id: systemInvestment.id,
        amount: systemInvestment.amount,
      } : null,
    });

  } catch (error) {
    console.error("AI evaluation error:", error);
    return NextResponse.json(
      { error: "AI 평가 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
