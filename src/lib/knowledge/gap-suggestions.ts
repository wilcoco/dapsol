import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

/**
 * After a QASet is assigned to a cluster, check for unresolved gaps
 * and notify the creator about related ones they might be able to help with.
 */
export async function suggestGapsToCreator(qaSetId: string, userId: string): Promise<void> {
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: { topicClusterId: true, title: true },
  });

  if (!qaSet?.topicClusterId) return;

  const gaps = await prisma.knowledgeGap.findMany({
    where: {
      topicClusterId: qaSet.topicClusterId,
      isResolved: false,
    },
    orderBy: { severity: "desc" },
    take: 2,
    include: {
      topicCluster: { select: { name: true } },
    },
  });

  if (gaps.length === 0) return;

  const gapDescriptions = gaps.map(g => `\u2022 ${g.description}`).join("\n");

  await createNotification({
    userId,
    type: "knowledge_gap_suggestion",
    title: `"${gaps[0].topicCluster.name}" 주제에 당신의 지식이 필요합니다`,
    body: `이 주제에서 아직 해결되지 않은 질문이 있습니다:\n${gapDescriptions}\n관련 경험이 있으시면 새 Q&A를 만들어보세요.`,
    link: "/?section=section1",
    qaSetId,
  });
}
