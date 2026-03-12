import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/qa-sets/[id] - Get single Q&A set with messages
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const qaSet = await prisma.qASet.findUnique({
    where: { id },
    include: {
      creator: {
        select: { id: true, name: true, image: true, trustLevel: true, hubScore: true, authorityScore: true },
      },
      messages: {
        orderBy: { orderIndex: "asc" },
      },
      tags: {
        include: { tag: { select: { id: true, name: true, slug: true } } },
      },
      investments: {
        where: { isActive: true },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
        orderBy: { position: "asc" },
        // include cumulativeReward and createdAt for uninvest window check
      },
      // 포크일 때 부모 Q&A 기본 정보 포함 (메시지 경계 표시 + 로열티 안내용)
      parentQASet: {
        select: {
          id: true,
          title: true,
          creator: { select: { id: true, name: true, authorityScore: true } },
        },
      },
    },
  });

  if (!qaSet) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Increment view count for shared Q&As
  if (qaSet.isShared) {
    await prisma.qASet.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  }

  return NextResponse.json(qaSet);
}

// PATCH /api/qa-sets/[id] - Update Q&A set
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { title, summary } = await req.json();

  const qaSet = await prisma.qASet.findUnique({ where: { id } });
  if (!qaSet || qaSet.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Not found or not authorized" }, { status: 403 });
  }

  const updated = await prisma.qASet.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(summary !== undefined && { summary }),
    },
  });

  return NextResponse.json(updated);
}
