import { prisma } from "@/lib/prisma";

type ContributionType = "question" | "improvement" | "insight" | "rebuttal" | "evidence";

export async function recordContribution(
  userId: string,
  qaSetId: string,
  contributionType: ContributionType,
  description?: string
): Promise<void> {
  // Get the QASet's cluster
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: { topicClusterId: true },
  });
  if (!qaSet?.topicClusterId) return;

  const clusterId = qaSet.topicClusterId;

  // Upsert contribution record
  const fieldMap: Record<ContributionType, string> = {
    question: "questionsAsked",
    improvement: "answersImproved",
    insight: "insightsContributed",
    rebuttal: "rebuttalsProvided",
    evidence: "evidenceAdded",
  };

  const field = fieldMap[contributionType];

  await prisma.userTopicContribution.upsert({
    where: { userId_topicClusterId: { userId, topicClusterId: clusterId } },
    create: {
      userId,
      topicClusterId: clusterId,
      [field]: 1,
      lastContributedAt: new Date(),
    },
    update: {
      [field]: { increment: 1 },
      lastContributedAt: new Date(),
    },
  });

  // Create evolution event
  const eventTypeMap: Record<ContributionType, string> = {
    question: "initial_question",
    improvement: "refinement",
    insight: "new_perspective",
    rebuttal: "rebuttal",
    evidence: "evidence",
  };

  await prisma.knowledgeEvolutionEvent.create({
    data: {
      topicClusterId: clusterId,
      qaSetId,
      userId,
      eventType: eventTypeMap[contributionType],
      description: description ?? `${contributionType} 기여`,
    },
  });
}
