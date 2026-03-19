import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST /api/clusters/[id]/join
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const cluster = await prisma.topicCluster.findUnique({
    where: { id },
    select: { id: true, accessType: true },
  });

  if (!cluster) return NextResponse.json({ error: "클러스터를 찾을 수 없습니다" }, { status: 404 });
  if (cluster.accessType === "private") {
    return NextResponse.json({ error: "비공개 클러스터입니다" }, { status: 403 });
  }
  if (cluster.accessType === "invite_only") {
    return NextResponse.json({ error: "초대제 클러스터입니다. 관리자에게 초대를 요청하세요" }, { status: 403 });
  }

  const member = await prisma.clusterMember.upsert({
    where: { userId_clusterId: { userId: session.user.id, clusterId: id } },
    update: {},
    create: { userId: session.user.id, clusterId: id, role: "member" },
  });

  return NextResponse.json(member);
}
