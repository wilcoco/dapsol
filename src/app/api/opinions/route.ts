import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// POST /api/opinions - Create opinion node
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
  }

  const opinion = await prisma.opinionNode.create({
    data: {
      content: content.trim(),
      userId: session.user.id,
    },
    include: {
      user: {
        select: { name: true, image: true },
      },
    },
  });

  return NextResponse.json(opinion);
}
