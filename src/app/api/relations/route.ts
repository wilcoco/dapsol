import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { checkAndTriggerControversy } from "@/lib/knowledge/controversy-question";

// POST /api/relations - Create a relation between nodes
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  // If creating relation from Q&A follow-up context
  if (body.qaSetId && body.relationType) {
    // Get the Q&A set messages to find the last two Q&A pairs
    const messages = await prisma.message.findMany({
      where: { qaSetId: body.qaSetId },
      orderBy: { orderIndex: "asc" },
    });

    // This is tracked within the same QASet for now
    // In the future, this could link between different QASets
    const relation = await prisma.nodeRelation.create({
      data: {
        sourceQASetId: body.sourceQASetId ?? body.qaSetId,
        targetQASetId: body.targetQASetId ?? body.qaSetId,
        relationType: body.relationType,
        isAIGenerated: true,
      },
    });

    // Trigger controversy check for counterargument/contradiction relations
    if (body.relationType === "counterargument" || body.relationType === "contradiction") {
      const sourceId = body.sourceQASetId ?? body.qaSetId;
      const targetId = body.targetQASetId ?? body.qaSetId;
      checkAndTriggerControversy(sourceId).catch(console.error);
      if (targetId !== sourceId) {
        checkAndTriggerControversy(targetId).catch(console.error);
      }
    }

    return NextResponse.json(relation);
  }

  // Generic relation creation
  const { sourceQASetId, targetQASetId, sourceOpinionId, targetOpinionId, relationType } = body;

  const relation = await prisma.nodeRelation.create({
    data: {
      sourceQASetId: sourceQASetId || null,
      targetQASetId: targetQASetId || null,
      sourceOpinionId: sourceOpinionId || null,
      targetOpinionId: targetOpinionId || null,
      relationType: relationType || "deepening",
      isAIGenerated: false,
    },
  });

  // Trigger controversy check for counterargument/contradiction relations
  const effectiveType = relationType || "deepening";
  if (effectiveType === "counterargument" || effectiveType === "contradiction") {
    if (sourceQASetId) checkAndTriggerControversy(sourceQASetId).catch(console.error);
    if (targetQASetId && targetQASetId !== sourceQASetId) {
      checkAndTriggerControversy(targetQASetId).catch(console.error);
    }
  }

  return NextResponse.json(relation);
}
