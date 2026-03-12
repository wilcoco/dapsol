import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectInsight } from "@/lib/knowledge/insight-detector";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/qa-sets/[id]/messages/[messageId]/improve
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, messageId } = await params;
  const { content, improvementNote } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: { qaSet: true },
  });

  if (!message || message.qaSetId !== id) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Save original content if first improvement
  const originalContent = message.originalContent ?? message.content;

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      content: content.trim(),
      originalContent,
      isImproved: true,
      improvedById: session.user.id,
      improvedAt: new Date(),
      improvementNote: improvementNote?.trim() || null,
    },
  });

  // Fire-and-forget insight detection on the improved message
  detectInsight(messageId, content.trim(), `Original: ${originalContent}\nImproved: ${content.trim()}`).catch(console.error);

  return NextResponse.json(updated);
}
