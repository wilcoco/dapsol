import { prisma } from "@/lib/prisma";
import { enqueueJobs } from "@/lib/background/pg-job-queue";
import "@/lib/background/job-handlers-init";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/generate-questions
 *
 * Cron job: finds clusters with aiQuestionEnabled where interval has elapsed,
 * enqueues generateAIQuestion jobs for each.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const now = new Date();

  const eligibleClusters = await prisma.topicCluster.findMany({
    where: {
      aiQuestionEnabled: true,
      OR: [
        { aiLastQuestionAt: null },
        {
          aiLastQuestionAt: {
            lt: new Date(now.getTime() - 1000 * 60 * 60), // at least 1 hour (actual interval checked below)
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      aiQuestionInterval: true,
      aiLastQuestionAt: true,
    },
  });

  let enqueued = 0;
  for (const cluster of eligibleClusters) {
    const intervalMs = cluster.aiQuestionInterval * 60 * 60 * 1000;
    const lastGen = cluster.aiLastQuestionAt?.getTime() ?? 0;
    if (now.getTime() - lastGen >= intervalMs) {
      await enqueueJobs(`ai-question-${cluster.id}`, [
        { name: "generateAIQuestion", payload: { clusterId: cluster.id } },
      ]);
      enqueued++;
    }
  }

  return NextResponse.json({
    checked: eligibleClusters.length,
    enqueued,
    timestamp: now.toISOString(),
  });
}
