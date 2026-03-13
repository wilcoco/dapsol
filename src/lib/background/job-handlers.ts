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
