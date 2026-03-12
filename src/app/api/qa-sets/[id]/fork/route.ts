import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const original = await prisma.qASet.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { orderIndex: "asc" } },
      tags: { include: { tag: true } },
    },
  });

  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!original.isShared) {
    return NextResponse.json({ error: "Can only fork shared Q&A sets" }, { status: 400 });
  }

  const fork = await prisma.qASet.create({
    data: {
      title: original.title ? `[포크] ${original.title}` : "[포크] 제목 없음",
      summary: original.summary,
      creatorId: session.user.id,
      parentQASetId: id,
      isShared: false,
      messages: {
        create: original.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          originalContent: msg.originalContent ?? msg.content,
          isImproved: false,
          orderIndex: msg.orderIndex,
        })),
      },
      tags: {
        create: original.tags.map((t) => ({ tagId: t.tagId })),
      },
    },
    include: {
      creator: { select: { id: true, name: true, image: true, trustLevel: true } },
      messages: { orderBy: { orderIndex: "asc" } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
    },
  });

  return NextResponse.json(fork, { status: 201 });
}
