import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/qa-sets/with-question
 * QASet 생성 + 첫 번째 질문 메시지를 한번에 저장.
 * 인간 답변 모드에서 사용: 갭 설명이 질문이 되고, 사용자가 직접 답변을 작성.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, question } = await req.json();

  const qaSet = await prisma.qASet.create({
    data: {
      title: title || null,
      creatorId: session.user.id,
      messages: {
        create: {
          role: "user",
          content: question || title || "",
          orderIndex: 0,
        },
      },
    },
    include: {
      creator: {
        select: { id: true, name: true, image: true, trustLevel: true },
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
      },
      parentQASet: {
        select: {
          id: true,
          title: true,
          creator: { select: { id: true, name: true, authorityScore: true } },
        },
      },
    },
  });

  return NextResponse.json(qaSet);
}
