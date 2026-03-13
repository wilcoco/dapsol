import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "50"),
    100
  );

  const clusters = await prisma.topicCluster.findMany({
    include: {
      _count: { select: { qaSets: true, knowledgeGaps: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ clusters });
}
