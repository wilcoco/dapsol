/**
 * GET /api/tags
 * 인기 태그 목록 반환 (Q&A 수 기준 상위 20개).
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  // 공유된 Q&A에 달린 태그를 Q&A 수 기준으로 집계
  const tagCounts = await prisma.qASetTag.groupBy({
    by: ["tagId"],
    where: {
      qaSet: { isShared: true },
    },
    _count: { tagId: true },
    orderBy: { _count: { tagId: "desc" } },
    take: 20,
  });

  if (tagCounts.length === 0) return NextResponse.json({ tags: [] });

  const tagIds = tagCounts.map((t) => t.tagId);
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true, name: true, slug: true },
  });

  // tagCounts 순서대로 정렬
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const result = tagCounts
    .map((tc) => {
      const tag = tagMap.get(tc.tagId);
      if (!tag) return null;
      return { ...tag, count: tc._count.tagId };
    })
    .filter(Boolean);

  return NextResponse.json({ tags: result });
}
