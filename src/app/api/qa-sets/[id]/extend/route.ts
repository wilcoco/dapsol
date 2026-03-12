import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST /api/qa-sets/[id]/extend
// Creates a child QASet (copying parent messages) owned by the current user.
// If an unshared child already exists for this user+parent, returns it instead.
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
    },
  });

  if (!original) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!original.isShared) {
    return NextResponse.json({ error: "공유된 Q&A만 확장할 수 있습니다." }, { status: 400 });
  }

  // Reuse existing unshared child if available
  const existing = await prisma.qASet.findFirst({
    where: { parentQASetId: id, creatorId: session.user.id, isShared: false },
    include: {
      creator: { select: { id: true, name: true, image: true, trustLevel: true } },
      messages: { orderBy: { orderIndex: "asc" } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
    },
  });

  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  const child = await prisma.qASet.create({
    data: {
      title: original.title,
      creatorId: session.user.id,
      parentQASetId: id,
      parentMessageCount: original.messages.length, // 원본에서 복사된 메시지 수 기록
      isShared: false,
      messages: {
        create: original.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
          originalContent: msg.content,
          isImproved: false,
          orderIndex: msg.orderIndex,
        })),
      },
    },
    include: {
      creator: { select: { id: true, name: true, image: true, trustLevel: true } },
      messages: { orderBy: { orderIndex: "asc" } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
    },
  });

  return NextResponse.json(child, { status: 201 });
}
