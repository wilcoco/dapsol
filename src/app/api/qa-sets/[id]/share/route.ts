import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { calculateEffectiveAmount } from "@/lib/engine/reward-calculator";
import { recalculateUserScores } from "@/lib/engine/hits";
import { enqueueJobs } from "@/lib/background/pg-job-queue";
import "@/lib/background/job-handlers-init";

// POST /api/qa-sets/[id]/share - Share a Q&A set with Authority-capped self-investment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { investAmount, creatorNote } = await req.json();

  if (!investAmount || investAmount <= 0) {
    return NextResponse.json({ error: "경작 포인트를 입력해주세요." }, { status: 400 });
  }

  // Get user and Q&A set
  const [user, qaSet] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.qASet.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { orderIndex: "asc" },
          take: 6,
          select: { role: true, content: true },
        },
      },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!qaSet) return NextResponse.json({ error: "Q&A set not found" }, { status: 404 });
  if (qaSet.creatorId !== session.user.id)
    return NextResponse.json({ error: "본인의 Q&A만 공유할 수 있습니다." }, { status: 403 });
  if (qaSet.isShared)
    return NextResponse.json({ error: "이미 공유된 Q&A입니다." }, { status: 400 });
  if (user.balance < investAmount)
    return NextResponse.json({ error: "잔액이 부족합니다." }, { status: 400 });

  // Authority = 자기 QA 공유 시 투자 가능한 최대값
  const authority = user.authorityScore ?? 100;
  if (investAmount > authority) {
    return NextResponse.json({
      error: `현재 Authority(${Math.round(authority)})보다 많이 경작할 수 없습니다.`,
      code: "AUTHORITY_LIMIT",
      maxInvestment: Math.floor(authority),
    }, { status: 400 });
  }

  // 공유 시점 Authority 스냅샷
  const creatorAuthorityStake = authority;
  const effAmount = calculateEffectiveAmount(investAmount, user.hubScore ?? 1.0);

  // 첫 투자는 분배 대상 없으므로 전액 quality pool로
  const qualityPool = investAmount;

  // Share + real investment transaction
  await prisma.$transaction([
    prisma.qASet.update({
      where: { id },
      data: {
        isShared: true,
        sharedAt: new Date(),
        creatorAuthorityStake,
        totalInvested: investAmount,
        investorCount: 1,
        qualityPool,
        ...(creatorNote ? { summary: creatorNote.slice(0, 2000) } : {}),
      },
    }),
    prisma.investment.create({
      data: {
        qaSetId: id,
        userId: session.user.id,
        amount: investAmount,
        position: 1,
        effectiveAmount: effAmount,
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { decrement: investAmount } },
    }),
  ]);

  // Authority 재계산 (공유 QA 수 증가 + 자기투자 반영)
  recalculateUserScores(prisma, session.user.id).catch(() => {});

  // Persistent background jobs with dependency ordering
  enqueueJobs(id, [
    { name: "generateKeywords", payload: { qaSetId: id } },
    { name: "generateEmbedding", payload: { qaSetId: id } },
    { name: "extractKnowledge", payload: { qaSetId: id } },
    { name: "autoLink", payload: { qaSetId: id }, dependsOn: ["generateEmbedding"] },
    {
      name: "assignCluster",
      payload: { qaSetId: id, userId: session.user.id, title: qaSet.title },
      dependsOn: ["generateEmbedding"],
    },
    {
      name: "aggregateRelations",
      payload: { qaSetId: id },
      dependsOn: ["autoLink", "assignCluster"],
    },
  ]);

  return NextResponse.json({
    success: true,
    creatorAuthorityStake,
    investAmount,
  });
}

