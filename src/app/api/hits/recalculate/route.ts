import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { recalculateHITS } from "@/lib/engine/hits";

// POST /api/hits/recalculate - Trigger HITS recalculation
// Can be called manually or via cron/webhook
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await recalculateHITS(prisma);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("HITS recalculation error:", error);
    return NextResponse.json(
      { error: "Recalculation failed" },
      { status: 500 }
    );
  }
}

// GET /api/hits/recalculate - Get current HITS scores
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [topHubs, topAuthorities] = await Promise.all([
    prisma.user.findMany({
      where: { hubScore: { gt: 1.0 } },
      orderBy: { hubScore: "desc" },
      take: 20,
      select: { id: true, name: true, hubScore: true },
    }),
    prisma.qASet.findMany({
      where: { authorityScore: { gt: 0 }, isShared: true },
      orderBy: { authorityScore: "desc" },
      take: 20,
      select: { id: true, title: true, authorityScore: true, qualityPool: true },
    }),
  ]);

  return NextResponse.json({ topHubs, topAuthorities });
}
