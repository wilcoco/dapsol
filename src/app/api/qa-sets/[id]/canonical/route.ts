import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/qa-sets/[id]/canonical — 중복 후보 검색
 * 해당 QASet과 유사한 다른 공유된 QASet을 찾아 반환
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;

  try {
    const qaSet = await prisma.qASet.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        embedding: true,
        canonicalStatus: true,
        canonicalParentId: true,
        isShared: true,
      },
    });

    if (!qaSet) {
      return NextResponse.json({ error: "Q&A를 찾을 수 없습니다." }, { status: 404 });
    }

    // Find similar QASets using embedding similarity
    let candidates: Array<{
      id: string;
      title: string | null;
      totalInvested: number;
      investorCount: number;
      canonicalStatus: string;
      similarity: number;
    }> = [];

    if (qaSet.embedding) {
      const embeddingArray = JSON.parse(qaSet.embedding);
      const embeddingStr = `[${embeddingArray.join(",")}]`;

      // Find top 5 similar shared QASets (excluding self)
      const similar = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          title: string | null;
          totalInvested: number;
          investorCount: number;
          canonicalStatus: string;
          similarity: number;
        }>
      >(
        `SELECT id, title, "totalInvested", "investorCount", "canonicalStatus",
                1 - (embedding_vec <=> $1::vector) as similarity
         FROM "QASet"
         WHERE id != $2
           AND "isShared" = true
           AND embedding_vec IS NOT NULL
           AND 1 - (embedding_vec <=> $1::vector) > 0.80
         ORDER BY similarity DESC
         LIMIT 5`,
        embeddingStr,
        id
      );
      candidates = similar;
    }

    return NextResponse.json({
      qaSet: {
        id: qaSet.id,
        title: qaSet.title,
        canonicalStatus: qaSet.canonicalStatus,
        canonicalParentId: qaSet.canonicalParentId,
      },
      candidates,
    });
  } catch (err) {
    console.error("Canonical search error:", err);
    return NextResponse.json({ error: "중복 검색에 실패했습니다." }, { status: 500 });
  }
}

/**
 * POST /api/qa-sets/[id]/canonical — 중복 병합 처리
 * body: { action: "mark_subordinate" | "mark_canonical" | "absorb", targetId?: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, targetId } = body;

  try {
    const qaSet = await prisma.qASet.findUnique({
      where: { id },
      select: { id: true, creatorId: true, canonicalStatus: true },
    });

    if (!qaSet) {
      return NextResponse.json({ error: "Q&A를 찾을 수 없습니다." }, { status: 404 });
    }

    // Only creator or admin can change canonical status
    if (qaSet.creatorId !== session.user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    switch (action) {
      case "mark_canonical": {
        // Mark this QASet as the canonical version
        await prisma.qASet.update({
          where: { id },
          data: { canonicalStatus: "canonical", canonicalParentId: null },
        });
        return NextResponse.json({ success: true, status: "canonical" });
      }

      case "mark_subordinate": {
        // Mark this QASet as subordinate to another
        if (!targetId) {
          return NextResponse.json({ error: "대상 Q&A ID가 필요합니다." }, { status: 400 });
        }
        const target = await prisma.qASet.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!target) {
          return NextResponse.json({ error: "대상 Q&A를 찾을 수 없습니다." }, { status: 404 });
        }
        await prisma.qASet.update({
          where: { id },
          data: { canonicalStatus: "subordinate", canonicalParentId: targetId },
        });
        // If target is still independent, promote it to canonical
        await prisma.qASet.updateMany({
          where: { id: targetId, canonicalStatus: "independent" },
          data: { canonicalStatus: "canonical" },
        });
        return NextResponse.json({ success: true, status: "subordinate", canonicalParentId: targetId });
      }

      case "absorb": {
        // Mark this QASet as absorbed (fully merged into another)
        if (!targetId) {
          return NextResponse.json({ error: "대상 Q&A ID가 필요합니다." }, { status: 400 });
        }
        await prisma.qASet.update({
          where: { id },
          data: { canonicalStatus: "absorbed", canonicalParentId: targetId },
        });
        return NextResponse.json({ success: true, status: "absorbed", canonicalParentId: targetId });
      }

      default:
        return NextResponse.json({ error: "지원되지 않는 액션입니다." }, { status: 400 });
    }
  } catch (err) {
    console.error("Canonical update error:", err);
    return NextResponse.json({ error: "상태 변경에 실패했습니다." }, { status: 500 });
  }
}
