import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST /api/clusters/[id]/invite — admin only
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { userId } = await req.json();

  if (!userId) return NextResponse.json({ error: "userId 필요" }, { status: 400 });

  // Check admin role
  const myMembership = await prisma.clusterMember.findUnique({
    where: { userId_clusterId: { userId: session.user.id, clusterId: id } },
  });
  if (!myMembership || myMembership.role !== "admin") {
    return NextResponse.json({ error: "관리자만 초대할 수 있습니다" }, { status: 403 });
  }

  const member = await prisma.clusterMember.upsert({
    where: { userId_clusterId: { userId, clusterId: id } },
    update: {},
    create: { userId, clusterId: id, role: "member", invitedById: session.user.id },
  });

  return NextResponse.json(member);
}
