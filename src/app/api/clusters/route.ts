import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/clusters — list clusters (private ones only for members)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "50"), 100);
  const userId = session.user.id;

  const clusters = await prisma.topicCluster.findMany({
    where: {
      OR: [
        { accessType: "public" },
        { members: { some: { userId } } },
        { createdById: userId },
      ],
    },
    include: {
      _count: { select: { qaSets: true, knowledgeGaps: true, members: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ clusters });
}

// POST /api/clusters — create a new cluster
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, description, accessType, aiQuestionEnabled, aiQuestionType, aiPromptHint } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return NextResponse.json({ error: "클러스터 이름은 2자 이상이어야 합니다" }, { status: 400 });
  }

  const cluster = await prisma.topicCluster.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      createdById: session.user.id,
      isManual: true,
      accessType: ["public", "private", "invite_only"].includes(accessType) ? accessType : "public",
      aiQuestionEnabled: aiQuestionEnabled === true,
      aiQuestionType: aiQuestionType === "community" ? "community" : "professional",
      aiPromptHint: aiPromptHint?.trim() || null,
      // Creator is automatically admin
      members: {
        create: { userId: session.user.id, role: "admin" },
      },
    },
    include: {
      _count: { select: { qaSets: true, members: true } },
    },
  });

  return NextResponse.json(cluster, { status: 201 });
}
