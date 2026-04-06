import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/opinions/[id]/invest
 *
 * 의견에 동의 투자 (단순 구조)
 * - 투자자 → 발자국 차감
 * - 의견 작성자 → 100% 보상
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: opinionId } = await params;
  const { amount } = await req.json();
  const investAmount = Math.max(5, Math.min(100, Number(amount) || 10));

  // 의견 조회
  const opinion = await prisma.opinionNode.findUnique({
    where: { id: opinionId },
    select: { id: true, userId: true },
  });

  if (!opinion) {
    return NextResponse.json({ error: "의견을 찾을 수 없습니다." }, { status: 404 });
  }

  // 잔액 확인
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { balance: true },
  });

  if (!user || user.balance < investAmount) {
    return NextResponse.json({ error: "발자국이 부족합니다." }, { status: 400 });
  }

  // 투자 실행: 차감 + 투자 생성 + 작성자 보상
  const position = await prisma.investment.count({ where: { opinionNodeId: opinionId } }) + 1;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { decrement: investAmount } },
    }),
    prisma.investment.create({
      data: {
        opinionNodeId: opinionId,
        userId: session.user.id,
        amount: investAmount,
        position,
        effectiveAmount: investAmount,
      },
    }),
    // 작성자에게 100% 보상 (본인 제외)
    ...(opinion.userId !== session.user.id ? [
      prisma.user.update({
        where: { id: opinion.userId },
        data: { balance: { increment: investAmount } },
      }),
    ] : []),
  ]);

  return NextResponse.json({ success: true, amount: investAmount });
}

/**
 * GET /api/opinions/[id]/invest - 투자 현황
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: opinionId } = await params;

  const investments = await prisma.investment.findMany({
    where: { opinionNodeId: opinionId, isActive: true },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({
    totalInvested: investments.reduce((s, i) => s + i.amount, 0),
    investorCount: investments.length,
    investments,
  });
}
