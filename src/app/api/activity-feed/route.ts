import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/activity-feed — 실시간 활동 피드
 * 최근 활동을 시간순으로 반환 (공유, 경작, 사냥, 마일스톤)
 */
export async function GET(req: NextRequest) {
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "20"),
    50
  );

  try {
    // Recent audit logs as activity feed
    const activities = await prisma.auditLog.findMany({
      where: {
        action: { in: ["share", "invest", "hunt", "milestone", "burn"] },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        userId: true,
        qaSetId: true,
        amount: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Batch fetch user names and QASet titles
    const userIds = [...new Set(activities.map((a) => a.userId))];
    const qaSetIds = [...new Set(activities.filter((a) => a.qaSetId).map((a) => a.qaSetId!))];

    const [users, qaSets] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      }),
      prisma.qASet.findMany({
        where: { id: { in: qaSetIds } },
        select: { id: true, title: true },
      }),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u.name ?? "익명"]));
    const qaSetMap = new Map(qaSets.map((q) => [q.id, q.title ?? "제목 없음"]));

    const feed = activities.map((a) => ({
      id: a.id,
      action: a.action,
      userName: userMap.get(a.userId) ?? "익명",
      qaSetTitle: a.qaSetId ? qaSetMap.get(a.qaSetId) ?? null : null,
      qaSetId: a.qaSetId,
      amount: a.amount,
      createdAt: a.createdAt.toISOString(),
      message: formatActivityMessage(
        a.action,
        userMap.get(a.userId) ?? "익명",
        a.amount,
        a.qaSetId ? qaSetMap.get(a.qaSetId) ?? "" : "",
      ),
    }));

    return NextResponse.json({ feed });
  } catch (err) {
    console.error("Activity feed error:", err);
    return NextResponse.json({ feed: [] });
  }
}

function formatActivityMessage(
  action: string,
  userName: string,
  amount: number | null,
  qaSetTitle: string,
): string {
  const title = qaSetTitle.length > 30 ? qaSetTitle.slice(0, 30) + "…" : qaSetTitle;

  switch (action) {
    case "share":
      return `${userName}님이 새 영토를 개척했습니다: "${title}"`;
    case "invest":
      return `${userName}님이 ${amount ?? 0}🌾 경작했습니다: "${title}"`;
    case "hunt":
      return `${userName}님이 ${amount ?? 0}🏹 사냥했습니다: "${title}"`;
    case "milestone":
      return `"${title}" 영토가 마일스톤을 달성했습니다!`;
    case "burn":
      return `${amount ?? 0} 포인트가 소각되었습니다`;
    default:
      return `${userName}님이 활동했습니다`;
  }
}
