/**
 * POST /api/decay
 *
 * 주간 포인트 감쇠 배치 실행 엔드포인트.
 * 비활성 사용자(최근 7일 투자 없음)의 잔액을 5% 감쇠.
 *
 * 보호: Authorization 헤더에 DECAY_SECRET 토큰 필요.
 * 환경변수 DECAY_SECRET 미설정 시 관리자 세션으로 폴백.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyDecay, DECAY_RATE, DECAY_INACTIVE_DAYS, DECAY_MIN_BALANCE } from "@/lib/engine/decay";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // 1. 인증: DECAY_SECRET 토큰 또는 세션 (개발 편의용)
  const authHeader = req.headers.get("authorization");
  const secret = process.env.DECAY_SECRET;

  if (secret) {
    // 운영 환경: Bearer 토큰 검증
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // 개발 환경: 세션 로그인 확인 (누구든 세션 있으면 실행 가능)
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized — set DECAY_SECRET for production" }, { status: 401 });
    }
  }

  try {
    const result = await applyDecay(prisma);

    return NextResponse.json({
      success: true,
      message: `포인트 감쇠 완료`,
      stats: {
        ...result,
        decayRate: `${(DECAY_RATE * 100).toFixed(0)}%`,
        inactiveDays: DECAY_INACTIVE_DAYS,
        minBalance: DECAY_MIN_BALANCE,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Decay error:", error);
    return NextResponse.json(
      { error: "감쇠 처리 중 오류가 발생했습니다.", details: String(error) },
      { status: 500 }
    );
  }
}

// GET: 감쇠 대상 사용자 미리보기 (dry-run)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DECAY_INACTIVE_DAYS);

  const activeUserIds = await prisma.investment.findMany({
    where: {
      createdAt: { gte: cutoffDate },
      isActive: true,
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const activeIdSet = new Set(activeUserIds.map((u: { userId: string }) => u.userId));

  const candidates = await prisma.user.findMany({
    where: { balance: { gt: DECAY_MIN_BALANCE } },
    select: { id: true, name: true, balance: true },
  });

  const inactiveUsers = candidates
    .filter((u) => !activeIdSet.has(u.id))
    .map((u) => {
      const decayAmount = Math.min(
        Math.floor(u.balance * DECAY_RATE),
        u.balance - DECAY_MIN_BALANCE
      );
      return {
        userId: u.id,
        name: u.name,
        currentBalance: u.balance,
        estimatedDecay: Math.max(0, decayAmount),
        afterDecay: u.balance - Math.max(0, decayAmount),
      };
    });

  const totalDecay = inactiveUsers.reduce((s, u) => s + u.estimatedDecay, 0);

  return NextResponse.json({
    dryRun: true,
    config: {
      decayRate: `${(DECAY_RATE * 100).toFixed(0)}%`,
      inactiveDays: DECAY_INACTIVE_DAYS,
      minBalance: DECAY_MIN_BALANCE,
    },
    summary: {
      totalUsers: candidates.length,
      activeUsers: activeIdSet.size,
      inactiveAffected: inactiveUsers.filter((u) => u.estimatedDecay > 0).length,
      totalDecayEstimate: totalDecay,
    },
    affectedUsers: inactiveUsers.filter((u) => u.estimatedDecay > 0),
  });
}
