import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/qa-sets/[id]/human-answer
 * 인간이 직접 답변을 작성. AI 대신 사람이 답변하는 경우.
 * - role: "assistant" (기존 QA와 동일한 형태로 노출)
 * - isGapResponse: true, isInsight: true (인간 고유 지식으로 표시)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "답변 내용이 필요합니다." }, { status: 400 });
  }

  const qaSet = await prisma.qASet.findUnique({
    where: { id },
    include: { messages: true },
  });

  if (!qaSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // AI 커뮤니티 질문은 누구나 답변 가능, 그 외에는 본인만
  const isAICommunityQuestion = qaSet.isAIGenerated && qaSet.aiQuestionType === "community";
  if (!isAICommunityQuestion && qaSet.creatorId !== session.user.id) {
    return NextResponse.json({ error: "본인의 Q&A에만 답변할 수 있습니다." }, { status: 403 });
  }

  const nextIndex = qaSet.messages.length;

  // 인간 답변을 assistant role로 저장 (기존 QA와 동일하게 노출되도록)
  await prisma.message.create({
    data: {
      qaSetId: id,
      role: "assistant",
      content: content.trim(),
      orderIndex: nextIndex,
      isGapResponse: true,
      isInsight: true,
      isHumanAuthored: true,
      insightReason: "사용자가 직접 작성한 인간 답변",
    },
  });

  // 전체 QASet 반환
  const updated = await prisma.qASet.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, image: true, trustLevel: true },
      },
      messages: {
        orderBy: { orderIndex: "asc" },
      },
      tags: {
        include: { tag: { select: { id: true, name: true, slug: true } } },
      },
      investments: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { position: "asc" },
      },
      parentQASet: {
        select: {
          id: true,
          title: true,
          creator: { select: { id: true, name: true, authorityScore: true } },
        },
      },
    },
  });

  return NextResponse.json(updated);
}
