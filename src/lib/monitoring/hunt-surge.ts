/**
 * 반대 투자 급증 감지
 * 특정 QASet에 짧은 시간 내 다수의 반대 투자가 집중되는 패턴을 감지
 */

import { PrismaClient } from "@prisma/client";

export interface HuntSurgeAlert {
  qaSetId: string;
  qaSetTitle: string | null;
  huntCount: number;
  totalHuntAmount: number;
  windowHours: number;
  hunterIds: string[];
}

/**
 * 최근 N시간 내 반대 투자 급증 QASet 감지
 * 기준: windowHours 내 3건 이상의 반대 투자가 발생한 경우
 */
export async function detectHuntSurges(
  prisma: PrismaClient,
  windowHours = 6,
  minHunts = 3
): Promise<HuntSurgeAlert[]> {
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Group negative investments by qaSetId in the window
  const surges = await prisma.investment.groupBy({
    by: ["qaSetId"],
    where: {
      isNegative: true,
      createdAt: { gte: since },
    },
    _count: true,
    _sum: { amount: true },
    having: {
      qaSetId: {
        _count: { gte: minHunts },
      },
    },
  });

  if (surges.length === 0) return [];

  // Fetch details
  const qaSetIds = surges.map((s) => s.qaSetId);
  const [qaSets, investments] = await Promise.all([
    prisma.qASet.findMany({
      where: { id: { in: qaSetIds } },
      select: { id: true, title: true },
    }),
    prisma.investment.findMany({
      where: {
        qaSetId: { in: qaSetIds },
        isNegative: true,
        createdAt: { gte: since },
      },
      select: { qaSetId: true, userId: true },
    }),
  ]);

  const titleMap = new Map(qaSets.map((q) => [q.id, q.title]));
  const hunterMap = new Map<string, Set<string>>();
  for (const inv of investments) {
    if (!hunterMap.has(inv.qaSetId)) hunterMap.set(inv.qaSetId, new Set());
    hunterMap.get(inv.qaSetId)!.add(inv.userId);
  }

  return surges.map((s) => ({
    qaSetId: s.qaSetId,
    qaSetTitle: titleMap.get(s.qaSetId) ?? null,
    huntCount: s._count,
    totalHuntAmount: s._sum.amount ?? 0,
    windowHours,
    hunterIds: [...(hunterMap.get(s.qaSetId) ?? [])],
  }));
}
