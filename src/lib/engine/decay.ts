/**
 * Point Decay System
 *
 * 비활성 사용자의 잔액을 주간 단위로 감쇠시켜 활성 참여를 유도.
 *
 * 규칙:
 * - 최근 7일 이내 투자 이력이 없는 사용자 = 비활성
 * - 비활성 사용자 잔액의 5% 감쇠 (주 1회)
 * - 최소 잔액 보호: 100 💎 미만으로 감쇠 불가
 * - 이미 100 이하인 경우 감쇠 없음
 */

import { PrismaClient } from "@prisma/client";

export const DECAY_RATE = 0.05;          // 5% 주간 감쇠
export const DECAY_MIN_BALANCE = 100;    // 최소 잔액 보호
export const DECAY_INACTIVE_DAYS = 7;   // 비활성 기준 (일)

export interface DecayResult {
  processed: number;       // 처리된 사용자 수
  decayed: number;         // 실제 감쇠된 사용자 수
  totalDecayed: number;    // 총 감쇠된 포인트 합계
  skipped: number;         // 스킵된 사용자 (최소 잔액 이하)
}

export interface UserDecayInfo {
  userId: string;
  oldBalance: number;
  newBalance: number;
  decayAmount: number;
}

/**
 * 모든 비활성 사용자에 대해 포인트 감쇠 적용.
 * @returns 감쇠 결과 통계
 */
export async function applyDecay(prisma: PrismaClient): Promise<DecayResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DECAY_INACTIVE_DAYS);

  // 비활성 사용자 찾기: 최근 DECAY_INACTIVE_DAYS일 이내에 투자 이력 없는 사용자
  // balance > DECAY_MIN_BALANCE인 사용자만 대상
  const activeUserIds = await prisma.investment.findMany({
    where: {
      createdAt: { gte: cutoffDate },
      isActive: true,
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  const activeIdSet = new Set(activeUserIds.map((u) => u.userId));

  // 감쇠 대상: 비활성 + balance > DECAY_MIN_BALANCE
  const candidates = await prisma.user.findMany({
    where: {
      balance: { gt: DECAY_MIN_BALANCE },
    },
    select: { id: true, balance: true },
  });

  const inactiveCandidates = candidates.filter((u) => !activeIdSet.has(u.id));

  if (inactiveCandidates.length === 0) {
    return { processed: 0, decayed: 0, totalDecayed: 0, skipped: 0 };
  }

  // 각 사용자의 감쇠 계산
  const decayUpdates: UserDecayInfo[] = [];
  let skipped = 0;

  for (const user of inactiveCandidates) {
    const decayAmount = Math.floor(user.balance * DECAY_RATE);
    const newBalance = user.balance - decayAmount;

    if (decayAmount <= 0 || newBalance < DECAY_MIN_BALANCE) {
      // 감쇠 후 최소 잔액 아래로 내려가면 → 최소 잔액까지만 감쇠
      const safeDecay = Math.max(0, user.balance - DECAY_MIN_BALANCE);
      if (safeDecay <= 0) {
        skipped++;
        continue;
      }
      decayUpdates.push({
        userId: user.id,
        oldBalance: user.balance,
        newBalance: DECAY_MIN_BALANCE,
        decayAmount: safeDecay,
      });
    } else {
      decayUpdates.push({
        userId: user.id,
        oldBalance: user.balance,
        newBalance,
        decayAmount,
      });
    }
  }

  if (decayUpdates.length === 0) {
    return {
      processed: inactiveCandidates.length,
      decayed: 0,
      totalDecayed: 0,
      skipped,
    };
  }

  // 배치 업데이트 (트랜잭션)
  await prisma.$transaction(
    decayUpdates.map((u) =>
      prisma.user.update({
        where: { id: u.userId },
        data: { balance: u.newBalance },
      })
    )
  );

  const totalDecayed = decayUpdates.reduce((sum, u) => sum + u.decayAmount, 0);

  return {
    processed: inactiveCandidates.length,
    decayed: decayUpdates.length,
    totalDecayed,
    skipped,
  };
}
