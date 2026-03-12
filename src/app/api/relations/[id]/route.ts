import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/relations/[id] - Update relation type
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { relationType } = await req.json();

  const updated = await prisma.nodeRelation.update({
    where: { id },
    data: {
      relationType,
      isUserModified: true,
    },
  });

  return NextResponse.json(updated);
}
