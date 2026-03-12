import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { generateSynthesis } from "@/lib/knowledge/synthesis";
import { detectGapsForCluster } from "@/lib/knowledge/gap-detector";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const cluster = await prisma.topicCluster.findUnique({
    where: { id },
    include: {
      qaSets: {
        where: { isShared: true },
        select: {
          id: true, title: true, summary: true, knowledgeCard: true,
          totalInvested: true, investorCount: true,
          creator: { select: { id: true, name: true, image: true } },
          _count: { select: { messages: true } },
          createdAt: true,
        },
        orderBy: { totalInvested: "desc" },
      },
      evolutionEvents: {
        orderBy: { createdAt: "asc" },
        take: 50,
      },
      knowledgeGaps: {
        where: { isResolved: false },
        orderBy: { severity: "desc" },
      },
      contributions: {
        orderBy: { topicAuthority: "desc" },
        take: 10,
        include: {
          topicCluster: { select: { name: true } },
        },
      },
    },
  });

  if (!cluster) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Get contributor user info
  const contributorIds = cluster.contributions.map(c => c.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: contributorIds } },
    select: { id: true, name: true, image: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  const contributionsWithUser = cluster.contributions.map(c => ({
    ...c,
    user: userMap.get(c.userId) ?? { id: c.userId, name: null, image: null },
  }));

  return NextResponse.json({ ...cluster, contributions: contributionsWithUser });
}

// POST: Trigger synthesis and gap detection for a cluster
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Fire both in parallel
  await Promise.all([
    generateSynthesis(id),
    detectGapsForCluster(id),
  ]);

  return NextResponse.json({ success: true });
}
