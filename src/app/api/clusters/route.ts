import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clusters = await prisma.topicCluster.findMany({
    include: {
      _count: { select: { qaSets: true, knowledgeGaps: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ clusters });
}
