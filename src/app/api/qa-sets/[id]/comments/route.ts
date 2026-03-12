import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/qa-sets/[id]/comments - Get investor comments for a Q&A set
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const investments = await prisma.investment.findMany({
    where: {
      qaSetId: id,
      isActive: true,
      comment: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      amount: true,
      isNegative: true,
      comment: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          image: true,
        },
      },
    },
  });

  return NextResponse.json(investments);
}
