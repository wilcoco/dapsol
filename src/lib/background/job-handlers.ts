/**
 * Background Job Handlers
 *
 * Registers all named job handlers for the persistent job queue.
 * Import this file at app startup to register handlers.
 */

import { prisma } from "@/lib/prisma";
import { registerJobHandler } from "./pg-job-queue";
import Anthropic from "@anthropic-ai/sdk";
import {
  generateEmbedding,
  assembleTextForEmbedding,
  saveEmbeddingToDb,
} from "@/lib/search/embedding";
import { extractKnowledgeCard } from "@/lib/knowledge/knowledge-card";
import { autoLinkQASet } from "@/lib/knowledge/auto-linker";
import { assignToCluster } from "@/lib/knowledge/clustering";
import { recordContribution } from "@/lib/knowledge/contribution-tracker";
import { suggestGapsToCreator } from "@/lib/knowledge/gap-suggestions";
import { checkAndResolveGaps } from "@/lib/knowledge/gap-resolver";
import { aggregateClusterRelationsForQASet } from "@/lib/knowledge/cluster-relations";
import { getSystemAIUser } from "@/lib/system-user";
import { enqueueJobs } from "./pg-job-queue";

/**
 * Register all background job handlers.
 * Call once at application startup.
 */
export function registerAllJobHandlers(): void {
  registerJobHandler("generateKeywords", async (payload) => {
    const { qaSetId } = payload as { qaSetId: string };
    const qaSet = await prisma.qASet.findUnique({
      where: { id: qaSetId },
      select: {
        title: true,
        messages: { orderBy: { orderIndex: "asc" }, take: 6, select: { role: true, content: true } },
      },
    });
    if (!qaSet) return;
    await generateAndSaveKeywords(qaSetId, qaSet.title, qaSet.messages);
  });

  registerJobHandler("generateEmbedding", async (payload) => {
    const { qaSetId } = payload as { qaSetId: string };
    const qaSet = await prisma.qASet.findUnique({
      where: { id: qaSetId },
      select: {
        title: true,
        messages: { orderBy: { orderIndex: "asc" }, take: 6, select: { role: true, content: true } },
      },
    });
    if (!qaSet) return;
    await generateAndSaveEmbeddingJob(qaSetId, qaSet.title, qaSet.messages);
  });

  registerJobHandler("extractKnowledge", async (payload) => {
    const { qaSetId } = payload as { qaSetId: string };
    const qaSet = await prisma.qASet.findUnique({
      where: { id: qaSetId },
      select: {
        title: true,
        messages: { orderBy: { orderIndex: "asc" }, take: 6, select: { role: true, content: true } },
      },
    });
    if (!qaSet) return;
    await extractKnowledgeCard(qaSetId, qaSet.title, qaSet.messages);
  });

  registerJobHandler("autoLink", async (payload) => {
    const { qaSetId } = payload as { qaSetId: string };
    await autoLinkQASet(qaSetId);
  });

  registerJobHandler("assignCluster", async (payload) => {
    const { qaSetId, userId, title } = payload as { qaSetId: string; userId: string; title?: string };
    const clusterId = await assignToCluster(qaSetId);
    if (clusterId) {
      await Promise.allSettled([
        recordContribution(userId, qaSetId, "question", title),
        suggestGapsToCreator(qaSetId, userId),
        checkAndResolveGaps(qaSetId, clusterId),
      ]);
    }
  });

  registerJobHandler("aggregateRelations", async (payload) => {
    const { qaSetId } = payload as { qaSetId: string };
    await aggregateClusterRelationsForQASet(qaSetId);
  });

  // ─── AI Question Generation ───
  registerJobHandler("generateAIQuestion", async (payload) => {
    const { clusterId } = payload as { clusterId: string };
    await generateAIQuestionForCluster(clusterId);
  });
}

// ─── Helper functions (moved from share route) ───

async function generateAndSaveKeywords(
  qaSetId: string,
  title: string | null,
  messages: { role: string; content: string }[]
): Promise<void> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const firstUser = messages.find((m) => m.role === "user")?.content ?? "";
  const firstAssistant = messages.find((m) => m.role === "assistant")?.content ?? "";
  const context = [
    title ? `제목: ${title}` : "",
    firstUser ? `질문: ${firstUser.slice(0, 300)}` : "",
    firstAssistant ? `답변 요약: ${firstAssistant.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `다음 Q&A의 핵심 검색 키워드를 생성해주세요.
한국어 키워드 5~8개와 영어 키워드 5~8개를 모두 포함해야 합니다.
동의어, 관련 개념, 기술 용어도 포함하세요.
쉼표로만 구분된 키워드 목록만 출력하세요 (설명 없이).

${context}`,
      },
    ],
  });

  const keywords = response.content[0].type === "text" ? response.content[0].text.trim() : "";
  if (keywords) {
    await prisma.qASet.update({
      where: { id: qaSetId },
      data: { searchKeywords: keywords },
    });
  }
}

async function generateAndSaveEmbeddingJob(
  qaSetId: string,
  title: string | null,
  messages: { role: string; content: string }[]
): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  const text = assembleTextForEmbedding(title, messages);
  const embedding = await generateEmbedding(text);
  await saveEmbeddingToDb(prisma, qaSetId, embedding);
}

// ─── AI Question Generation for a Cluster ───

async function generateAIQuestionForCluster(clusterId: string): Promise<void> {
  const cluster = await prisma.topicCluster.findUnique({
    where: { id: clusterId },
    select: {
      id: true,
      name: true,
      description: true,
      aiQuestionType: true,
      aiPromptHint: true,
      qaSets: {
        where: { isShared: true },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { title: true },
      },
      knowledgeGaps: {
        where: { isResolved: false },
        take: 5,
        select: { description: true },
      },
    },
  });
  if (!cluster) return;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const systemUser = await getSystemAIUser();

  const isComm = cluster.aiQuestionType === "community";
  const recentTitles = cluster.qaSets.map((q) => q.title).filter(Boolean).join(", ");
  const gaps = cluster.knowledgeGaps.map((g) => g.description).join("; ");

  const prompt = isComm
    ? `당신은 커뮤니티 활성화를 위한 질문 생성기입니다.
주제 영역: ${cluster.name}
${cluster.description ? `설명: ${cluster.description}` : ""}
${cluster.aiPromptHint ? `힌트: ${cluster.aiPromptHint}` : ""}
최근 Q&A: ${recentTitles || "없음"}

이 주제와 관련하여 사람들이 자신의 경험을 공유하고 싶어할 만한 흥미로운 질문을 1개 생성하세요.
- 개인 경험을 묻는 개방형 질문
- 전문 용어 최소화, 누구나 답할 수 있게
- 이미 있는 질문과 겹치지 않게

JSON으로만 응답: {"title": "짧은 제목", "question": "전체 질문 내용"}`
    : `당신은 전문 지식 Q&A 플랫폼의 질문 생성기입니다.
주제 영역: ${cluster.name}
${cluster.description ? `설명: ${cluster.description}` : ""}
${cluster.aiPromptHint ? `힌트: ${cluster.aiPromptHint}` : ""}
최근 Q&A: ${recentTitles || "없음"}
${gaps ? `미해결 지식 갭: ${gaps}` : ""}

이 분야에서 전문가들이 답변하고 싶어할 만한 실용적인 질문을 1개 생성하세요.
- 구체적이고 실무에 도움되는 질문
- 기존 Q&A와 겹치지 않는 새로운 각도
${gaps ? "- 미해결 갭을 해소할 수 있는 질문 우선" : ""}

JSON으로만 응답: {"title": "짧은 제목", "question": "전체 질문 내용"}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed: { title: string; question: string };
  try {
    parsed = JSON.parse(text.replace(/```json?\n?/g, "").replace(/```/g, "").trim());
  } catch {
    console.error("[generateAIQuestion] Failed to parse AI response:", text);
    return;
  }

  // Create QASet with the question
  const qaSet = await prisma.qASet.create({
    data: {
      title: parsed.title,
      creatorId: systemUser.id,
      topicClusterId: clusterId,
      isShared: true,
      sharedAt: new Date(),
      isAIGenerated: true,
      aiQuestionType: cluster.aiQuestionType,
      firstAnswerRewardMultiplier: isComm ? 3.0 : 1.0,
      messages: {
        create: {
          role: "user",
          content: parsed.question,
          orderIndex: 0,
        },
      },
    },
  });

  // For professional type, also generate an AI answer
  if (!isComm) {
    const answerResponse = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [
        { role: "user", content: parsed.question },
      ],
      system: `당신은 "${cluster.name}" 분야의 전문가입니다. 한국어로 실용적이고 구체적인 답변을 제공하세요.`,
    });
    const answerText = answerResponse.content[0].type === "text" ? answerResponse.content[0].text : "";
    if (answerText) {
      await prisma.message.create({
        data: {
          qaSetId: qaSet.id,
          role: "assistant",
          content: answerText,
          orderIndex: 1,
        },
      });
    }
  }

  // Update last generation time
  await prisma.topicCluster.update({
    where: { id: clusterId },
    data: { aiLastQuestionAt: new Date() },
  });

  // Enqueue downstream jobs
  await enqueueJobs(qaSet.id, [
    { name: "generateKeywords", payload: { qaSetId: qaSet.id } },
    { name: "generateEmbedding", payload: { qaSetId: qaSet.id } },
  ]);

  console.log(`[generateAIQuestion] Created ${isComm ? "community" : "professional"} question: "${parsed.title}" in cluster "${cluster.name}"`);
}
