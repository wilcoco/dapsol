/**
 * POST /api/investments/[id]/uninvest
 *
 * 투자 철회 (24시간 이내, 20% 페널티).
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  calculateUninvestRefund,
  UNINVEST_PENALTY_RATE,
  UNINVEST_WINDOW_HOURS,
} from "@/lib/engine/uninvestment";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // 투자 레코드 조회
  const investment = await prisma.investment.findUnique({
    where: { id },
    include: {
      qaSet: {
        select: { id: true, isShared: true, qualityPool: true, totalInvested: true, investorCount: true, negativeInvested: true, negativeCount: true },
      },
    },
  });

  if (!investment) {
    return NextResponse.json({ error: "투자를 찾을 수 없습니다." }, { status: 404 });
  }

  // 본인 투자만 철회 가능
  if (investment.userId !== session.user.id) {
    return NextResponse.json({ error: "본인의 투자만 철회할 수 있습니다." }, { status: 403 });
  }

  // 이미 철회된 투자
  if (!investment.isActive) {
    return NextResponse.json({ error: "이미 철회된 투자입니다." }, { status: 400 });
  }

  // 철회 가능 여부 + 환급액 계산
  const check = calculateUninvestRefund(investment.amount, investment.createdAt);
  if (!check.eligible || !check.result) {
    return NextResponse.json(
      {
        error: check.reason ?? "투자 철회 불가",
        code: "UNINVEST_WINDOW_EXPIRED",
        windowHours: UNINVEST_WINDOW_HOURS,
      },
      { status: 400 }
    );
  }

  const { refundAmount, penaltyAmount } = check.result;

  // 트랜잭션: 투자 비활성화 + 잔액 환급
  await prisma.$transaction([
    // 1. 투자 비활성화
    prisma.investment.update({
      where: { id },
      data: { isActive: false },
    }),
    // 2. 사용자 잔액 환급 (페널티 차감 후)
    prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { increment: refundAmount } },
    }),
    // 3. Q&A 세트 통계 업데이트 (플러스/마이너스 투자 구분)
    prisma.qASet.update({
      where: { id: investment.qaSetId },
      data: investment.isNegative
        ? {
            negativeInvested: { decrement: investment.amount },
            negativeCount: { decrement: 1 },
          }
        : {
            totalInvested: { decrement: investment.amount },
            investorCount: { decrement: 1 },
          },
    }),
  ]);

  // 4. 철회 보상 이벤트 기록 (음수 금액 = 철회)
  await prisma.rewardEvent.create({
    data: {
      recipientId: session.user.id,
      amount: refundAmount,
      qaSetId: investment.qaSetId,
      sourceInvestmentId: id,
      rewardType: "uninvest_refund",
    },
  });

  return NextResponse.json({
    success: true,
    refundAmount,
    penaltyAmount,
    penaltyRate: `${(UNINVEST_PENALTY_RATE * 100).toFixed(0)}%`,
    message: `투자 철회 완료. ${refundAmount} 💎 환급 (${penaltyAmount} 💎 페널티 소각)`,
  });
}
