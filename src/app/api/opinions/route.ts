import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { grantGapFillReward } from "@/lib/engine/footprint-rewards";

// POST /api/opinions - Create opinion node
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content, contentHtml, contentJson, targetMessageId, targetQASetId, relationType, isGapFill, confidenceAmount } = await req.json();

  // content 또는 contentHtml 중 하나는 필수
  const plainContent = content?.trim() || "";
  const htmlContent = contentHtml?.trim() || "";

  if (!plainContent && !htmlContent) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  // 확신 투자 검증
  const investAmount = Math.max(0, Math.min(100, confidenceAmount ?? 0));
  if (isGapFill && investAmount > 0) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { balance: true },
    });
    if (!user || user.balance < investAmount) {
      return NextResponse.json({ error: "발자국이 부족합니다." }, { status: 400 });
    }
  }

  // 의견 노드 생성
  const opinion = await prisma.opinionNode.create({
    data: {
      content: plainContent || htmlContent.replace(/<[^>]*>/g, "").slice(0, 500),
      contentHtml: htmlContent || null,
      contentJson: contentJson ? JSON.stringify(contentJson) : null,
      userId: session.user.id,
    },
    include: {
      user: {
        select: { id: true, name: true, image: true },
      },
    },
  });

  // 관계 생성 (targetMessageId 또는 targetQASetId가 있으면)
  if (targetMessageId || targetQASetId) {
    await prisma.nodeRelation.create({
      data: {
        sourceOpinionId: opinion.id,
        targetMessageId: targetMessageId || null,
        targetQASetId: targetMessageId ? null : targetQASetId,
        relationType: relationType || "comment",
        isAIGenerated: false,
      },
    });
  }

  // AI 빈틈 채우기 처리
  let reward = null;
  let investment = null;

  if (isGapFill && targetQASetId) {
    // 1. 빈틈 채우기 보상 지급 (+25 👣)
    reward = await grantGapFillReward(session.user.id, targetQASetId);

    // 2. 확신 투자 (자기 의견에 투자)
    if (investAmount > 0) {
      // 기존 의견 투자 수 확인 (position 계산)
      const existingCount = await prisma.investment.count({
        where: { opinionNodeId: opinion.id },
      });

      // 투자 생성 + 잔액 차감
      const [newInvestment] = await prisma.$transaction([
        prisma.investment.create({
          data: {
            opinionNodeId: opinion.id,
            userId: session.user.id,
            amount: investAmount,
            position: existingCount + 1,
            effectiveAmount: investAmount,
          },
        }),
        prisma.user.update({
          where: { id: session.user.id },
          data: { balance: { decrement: investAmount } },
        }),
      ]);

      investment = {
        id: newInvestment.id,
        amount: investAmount,
      };
    }
  }

  return NextResponse.json({ ...opinion, reward, investment });
}

// GET /api/opinions?messageId=xxx or ?qaSetId=xxx - Get opinions
export async function GET(req: NextRequest) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("messageId");
  const qaSetId = searchParams.get("qaSetId");

  if (!messageId && !qaSetId) {
    return NextResponse.json({ error: "messageId or qaSetId required" }, { status: 400 });
  }

  const relations = await prisma.nodeRelation.findMany({
    where: messageId
      ? { targetMessageId: messageId }
      : { targetQASetId: qaSetId },
    include: {
      sourceOpinion: {
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
          investments: {
            where: { isActive: true },
            select: { amount: true, userId: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // 시스템 AI 사용자 ID 조회
  const systemUser = await prisma.user.findFirst({
    where: { isSystemAI: true },
    select: { id: true },
  });

  const opinions = relations
    .filter((r) => r.sourceOpinion)
    .map((r) => {
      const op = r.sourceOpinion!;
      const totalInvested = op.investments.reduce((sum, i) => sum + i.amount, 0);
      const aiInvestment = systemUser
        ? op.investments.find(i => i.userId === systemUser.id)?.amount ?? 0
        : 0;
      const myInvestment = session?.user?.id
        ? op.investments.find(i => i.userId === session.user.id)?.amount
        : undefined;

      return {
        id: op.id,
        content: op.content,
        contentHtml: op.contentHtml,
        relationType: r.relationType,
        user: op.user,
        createdAt: op.createdAt,
        totalInvested,
        investorCount: op.investments.length,
        aiInvestment,
        myInvestment,
      };
    });

  return NextResponse.json({ opinions });
}
