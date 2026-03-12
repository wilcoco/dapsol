import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;

  const contributions = await prisma.userTopicContribution.findMany({
    where: { userId },
    include: { topicCluster: { select: { id: true, name: true, nameEn: true } } },
    orderBy: { topicAuthority: "desc" },
  });

  return NextResponse.json({ contributions });
}
