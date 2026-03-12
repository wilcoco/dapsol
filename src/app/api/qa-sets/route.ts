import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/qa-sets - List Q&A sets
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const shared = searchParams.get("shared") === "true";
  const sort = searchParams.get("sort") || "recent";
  const limit = parseInt(searchParams.get("limit") || "20");
  const page = parseInt(searchParams.get("page") || "1");

  const session = await auth();

  const where: any = {};

  if (shared) {
    where.isShared = true;
  } else if (session?.user?.id) {
    where.creatorId = session.user.id;
  } else {
    return NextResponse.json({ qaSets: [] });
  }

  const orderBy: any =
    sort === "trending"
      ? { totalInvested: "desc" as const }
      : sort === "top"
      ? { investorCount: "desc" as const }
      : { createdAt: "desc" as const };

  const qaSets = await prisma.qASet.findMany({
    where,
    orderBy,
    take: limit,
    skip: (page - 1) * limit,
    include: {
      creator: {
        select: { id: true, name: true, image: true },
      },
      tags: {
        include: { tag: { select: { name: true, slug: true } } },
      },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json({ qaSets });
}

// POST /api/qa-sets - Create new Q&A set
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title } = await req.json();

  const qaSet = await prisma.qASet.create({
    data: {
      title: title || null,
      creatorId: session.user.id,
    },
    include: {
      creator: {
        select: { id: true, name: true, image: true, trustLevel: true },
      },
      messages: true,
      tags: {
        include: { tag: { select: { id: true, name: true, slug: true } } },
      },
    },
  });

  return NextResponse.json(qaSet);
}
