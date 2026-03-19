import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/clusters/[id]/members
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const members = await prisma.clusterMember.findMany({
    where: { clusterId: id },
    include: { user: { select: { id: true, name: true, image: true } } },
    orderBy: { joinedAt: "asc" },
  });

  return NextResponse.json({ members });
}
