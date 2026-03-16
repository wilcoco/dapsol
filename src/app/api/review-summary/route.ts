import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { trackLLMCall } from "@/lib/monitoring/llm-tracker";

/**
 * POST /api/review-summary
 * AI가 공유된 Q&A를 분석하여 요약 + 행동 가이드를 생성합니다.
 * 사용자가 공유 Q&A를 열 때 호출됩니다.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { qaSetId } = await req.json();
  if (!qaSetId) {
    return NextResponse.json({ error: "qaSetId required" }, { status: 400 });
  }

  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    include: {
      messages: { orderBy: { orderIndex: "asc" }, take: 10 },
      creator: { select: { name: true } },
      investments: {
        where: { comment: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { comment: true, isNegative: true, amount: true, user: { select: { name: true } } },
      },
    },
  });

  if (!qaSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Must be shared OR owned by the requesting user
  if (!qaSet.isShared && qaSet.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  // Build conversation text for AI
  const conversation = qaSet.messages
    .map((m) => `${m.role === "user" ? "Q" : "A"}: ${m.content.slice(0, 600)}`)
    .join("\n\n");

  const investorComments = qaSet.investments
    .filter((inv) => inv.comment)
    .map((inv) => `${inv.user.name ?? "익명"} (${inv.isNegative ? "반대" : "투자"} ${inv.amount}P): ${inv.comment}`)
    .join("\n");

  const knowledgeCard = qaSet.knowledgeCard
    ? (() => { try { return JSON.parse(qaSet.knowledgeCard); } catch { return null; } })()
    : null;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const startTime = Date.now();

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `당신은 Q&A 리뷰어입니다. 공유된 Q&A를 분석하여 짧고 명확한 요약을 생성하세요.
반드시 JSON으로 응답하세요. 한국어로 작성하세요.`,
      messages: [
        {
          role: "user",
          content: `다음 Q&A를 분석하세요:

제목: ${qaSet.title ?? "없음"}
작성자: ${qaSet.creator?.name ?? "익명"}
투자: ${qaSet.totalInvested ?? 0}P (${qaSet.investorCount ?? 0}명)
반대투자: ${qaSet.negativeInvested ?? 0}P (${qaSet.negativeCount ?? 0}명)

대화:
${conversation}

${knowledgeCard ? `지식카드: ${knowledgeCard.coreClaim}\n한계: ${(knowledgeCard.limitations ?? []).join(", ")}` : ""}
${investorComments ? `투자자 코멘트:\n${investorComments}` : ""}

JSON으로 응답:
{
  "summary": "이 Q&A의 핵심 내용 2~3문장 요약",
  "strengths": ["잘된 점 1~2개"],
  "weaknesses": ["부족한 점 또는 주의할 점 0~2개"],
  "investReason": "투자할 만한 이유 1문장 (이 답변이 가치 있다면)",
  "counterReason": "반대 투자할 만한 이유 1문장 (문제가 있다면)",
  "opinionPrompt": "의견을 추가할 수 있는 포인트 1문장 (보충할 내용이 있다면)",
  "questionPrompt": "추가로 물어볼 만한 후속 질문 1개"
}`,
        },
      ],
    });

    trackLLMCall({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      purpose: "review-summary",
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      durationMs: Date.now() - startTime,
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "AI parse error" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json({
      ...parsed,
      investorCount: qaSet.investorCount ?? 0,
      negativeCount: qaSet.negativeCount ?? 0,
      totalInvested: qaSet.totalInvested ?? 0,
    });
  } catch (error) {
    console.error("Review summary error:", error);
    return NextResponse.json({ error: "Failed to generate review" }, { status: 500 });
  }
}
