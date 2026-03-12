import { prisma } from "@/lib/prisma";
import { analyzeWithAI } from "./ai-analysis";
import { createNotification } from "@/lib/notifications";

type ControversyType = "hunted" | "disputed" | "low_quality";

interface ControversyQuestion {
  question: string;
  context: string;
}

/**
 * 논란이 있는 Q&A에 대해 AI가 질문을 생성하고 관련 사용자에게 알림을 보냅니다.
 */
export async function generateControversyQuestion(qaSetId: string): Promise<void> {
  // Fetch Q&A with messages, relations, investment data
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    include: {
      messages: { orderBy: { orderIndex: "asc" } },
      relationsAsSource: true,
      relationsAsTarget: true,
      tags: { include: { tag: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  if (!qaSet || !qaSet.isShared) return;

  // Determine controversy type
  const controversyType = determineControversyType(qaSet);
  if (!controversyType) return;

  // Build content summary for AI prompt
  const contentSummary = qaSet.messages
    .slice(0, 6) // Limit to first 6 messages for prompt brevity
    .map((m) => `[${m.role === "user" ? "질문" : "답변"}] ${m.content.slice(0, 200)}`)
    .join("\n");

  const typeLabel = {
    hunted: "마이너스 투자(사냥)가 많이 발생",
    disputed: "반박 또는 모순 관계가 형성",
    low_quality: "부정적 평가를 받았으나 개선되지 않음",
  }[controversyType];

  const prompt = `다음은 논란이 있는 Q&A입니다. 이 Q&A에 대해 ${typeLabel}했습니다.

Q&A 내용:
${contentSummary}

이 Q&A의 논란 포인트를 파악하고, 다른 사용자들이 이 주제에 대해 새로운 관점이나 의견을 제시할 수 있도록 유도하는 자연스러운 한국어 질문을 하나 만들어주세요.

JSON 형식으로 응답해주세요:
{
  "question": "한국어로 된 질문 (60자 이내)",
  "context": "이 질문이 필요한 이유를 간단히 설명 (100자 이내)"
}`;

  const result = await analyzeWithAI<ControversyQuestion>({
    prompt,
    maxTokens: 512,
  });

  if (!result?.question) return;

  // Find relevant users (NOT the creator)
  const relevantUsers = await findRelevantUsers(qaSet);

  // Send notifications to each user
  const questionTruncated = result.question.length > 60
    ? result.question.slice(0, 57) + "..."
    : result.question;

  const notifOps = relevantUsers.map((userId) =>
    createNotification({
      userId,
      type: "controversy_question",
      title: questionTruncated,
      body: `${result.context} 이 주제에 대해 의견을 나눠주세요.`,
      link: `/?section=section2&qaSetId=${qaSetId}`,
      qaSetId,
    })
  );

  if (notifOps.length > 0) {
    await Promise.all(notifOps);
  }
}

function determineControversyType(qaSet: {
  totalInvested: number;
  negativeInvested: number;
  relationsAsSource: { relationType: string }[];
  relationsAsTarget: { relationType: string }[];
  messages: { isImproved: boolean }[];
}): ControversyType | null {
  const hasCounterOrContradiction = [
    ...qaSet.relationsAsSource,
    ...qaSet.relationsAsTarget,
  ].some((r) =>
    r.relationType === "counterargument" || r.relationType === "contradiction"
  );

  // hunted: significant negative investment
  if (qaSet.negativeInvested > qaSet.totalInvested * 0.3) {
    return "hunted";
  }

  // disputed: has counterargument or contradiction relations
  if (hasCounterOrContradiction) {
    return "disputed";
  }

  // low_quality: negative investment exists but no improvements
  if (qaSet.negativeInvested > 0 && !qaSet.messages.some((m) => m.isImproved)) {
    return "low_quality";
  }

  return null;
}

async function findRelevantUsers(qaSet: {
  id: string;
  creatorId: string;
  topicClusterId: string | null;
  tags: { tag: { id: string } }[];
}): Promise<string[]> {
  const userIds = new Set<string>();
  const creatorId = qaSet.creatorId;

  // 1. Users who created Q&As in the same topicCluster
  if (qaSet.topicClusterId) {
    const clusterQAs = await prisma.qASet.findMany({
      where: {
        topicClusterId: qaSet.topicClusterId,
        creatorId: { not: creatorId },
        isShared: true,
        id: { not: qaSet.id },
      },
      select: { creatorId: true },
      take: 10,
    });
    for (const q of clusterQAs) userIds.add(q.creatorId);
  }

  // 2. Users who created Q&As with matching tags
  if (qaSet.tags.length > 0) {
    const tagIds = qaSet.tags.map((t) => t.tag.id);
    const taggedQAs = await prisma.qASetTag.findMany({
      where: {
        tagId: { in: tagIds },
        qaSet: {
          creatorId: { not: creatorId },
          isShared: true,
          id: { not: qaSet.id },
        },
      },
      select: { qaSet: { select: { creatorId: true } } },
      take: 10,
    });
    for (const t of taggedQAs) userIds.add(t.qaSet.creatorId);
  }

  // 3. Users whose messages have isInsight = true in the same cluster
  if (qaSet.topicClusterId) {
    const insightMessages = await prisma.message.findMany({
      where: {
        isInsight: true,
        qaSet: {
          topicClusterId: qaSet.topicClusterId,
          creatorId: { not: creatorId },
          isShared: true,
        },
      },
      select: { qaSet: { select: { creatorId: true } } },
      take: 10,
    });
    for (const m of insightMessages) userIds.add(m.qaSet.creatorId);
  }

  // 4. Users who invested in the original Q&A
  const investors = await prisma.investment.findMany({
    where: {
      qaSetId: qaSet.id,
      userId: { not: creatorId },
      isActive: true,
    },
    select: { userId: true },
    take: 10,
  });
  for (const inv of investors) userIds.add(inv.userId);

  // Deduplicate (already a Set) and limit to 5
  return [...userIds].slice(0, 5);
}

/**
 * Quick check function called from API routes.
 * Only triggers controversy question generation if conditions are met.
 */
export async function checkAndTriggerControversy(qaSetId: string): Promise<void> {
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: {
      isShared: true,
      negativeInvested: true,
      relationsAsSource: {
        where: { relationType: { in: ["counterargument", "contradiction"] } },
        select: { id: true },
        take: 1,
      },
      relationsAsTarget: {
        where: { relationType: { in: ["counterargument", "contradiction"] } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!qaSet || !qaSet.isShared) return;

  const hasControversy =
    qaSet.negativeInvested > 0 ||
    qaSet.relationsAsSource.length > 0 ||
    qaSet.relationsAsTarget.length > 0;

  if (!hasControversy) return;

  // Check if already triggered in last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentNotification = await prisma.notification.findFirst({
    where: {
      type: "controversy_question",
      qaSetId,
      createdAt: { gte: oneDayAgo },
    },
    select: { id: true },
  });

  if (recentNotification) return;

  // Fire-and-forget
  generateControversyQuestion(qaSetId).catch(console.error);
}
