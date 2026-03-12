import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { calculateEffectiveAmount } from "@/lib/engine/reward-calculator";
import { recalculateUserScores } from "@/lib/engine/hits";
import {
  generateEmbedding,
  assembleTextForEmbedding,
  EMBEDDING_MODEL,
} from "@/lib/search/embedding";
import { extractKnowledgeCard } from "@/lib/knowledge/knowledge-card";
import { autoLinkQASet } from "@/lib/knowledge/auto-linker";
import { assignToCluster } from "@/lib/knowledge/clustering";
import { recordContribution } from "@/lib/knowledge/contribution-tracker";
import { suggestGapsToCreator } from "@/lib/knowledge/gap-suggestions";
import { checkAndResolveGaps } from "@/lib/knowledge/gap-resolver";
import { aggregateClusterRelationsForQASet } from "@/lib/knowledge/cluster-relations";
import { enqueueJobs } from "@/lib/background/job-queue";

// POST /api/qa-sets/[id]/share - Share a Q&A set with Authority-capped self-investment
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { investAmount, creatorNote } = await req.json();

  if (!investAmount || investAmount <= 0) {
    return NextResponse.json({ error: "경작 포인트를 입력해주세요." }, { status: 400 });
  }

  // Get user and Q&A set
  const [user, qaSet] = await Promise.all([
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.qASet.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { orderIndex: "asc" },
          take: 6,
          select: { role: true, content: true },
        },
      },
    }),
  ]);

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!qaSet) return NextResponse.json({ error: "Q&A set not found" }, { status: 404 });
  if (qaSet.creatorId !== session.user.id)
    return NextResponse.json({ error: "본인의 Q&A만 공유할 수 있습니다." }, { status: 403 });
  if (qaSet.isShared)
    return NextResponse.json({ error: "이미 공유된 Q&A입니다." }, { status: 400 });
  if (user.balance < investAmount)
    return NextResponse.json({ error: "잔액이 부족합니다." }, { status: 400 });

  // Authority = 자기 QA 공유 시 투자 가능한 최대값
  const authority = user.authorityScore ?? 100;
  if (investAmount > authority) {
    return NextResponse.json({
      error: `현재 Authority(${Math.round(authority)})보다 많이 경작할 수 없습니다.`,
      code: "AUTHORITY_LIMIT",
      maxInvestment: Math.floor(authority),
    }, { status: 400 });
  }

  // 공유 시점 Authority 스냅샷
  const creatorAuthorityStake = authority;
  const effAmount = calculateEffectiveAmount(investAmount, user.hubScore ?? 1.0);

  // 첫 투자는 분배 대상 없으므로 전액 quality pool로
  const qualityPool = investAmount;

  // Share + real investment transaction
  await prisma.$transaction([
    prisma.qASet.update({
      where: { id },
      data: {
        isShared: true,
        sharedAt: new Date(),
        creatorAuthorityStake,
        totalInvested: investAmount,
        investorCount: 1,
        qualityPool,
        ...(creatorNote ? { summary: creatorNote.slice(0, 2000) } : {}),
      },
    }),
    prisma.investment.create({
      data: {
        qaSetId: id,
        userId: session.user.id,
        amount: investAmount,
        position: 1,
        effectiveAmount: effAmount,
      },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { balance: { decrement: investAmount } },
    }),
  ]);

  // Authority 재계산 (공유 QA 수 증가 + 자기투자 반영)
  recalculateUserScores(prisma, session.user.id).catch(() => {});

  // Background jobs with proper dependency ordering and retry
  const userId = session.user.id;
  const title = qaSet.title;
  const msgs = qaSet.messages;

  enqueueJobs(id, [
    { name: "generateKeywords", fn: () => generateAndSaveKeywords(id, title, msgs) },
    { name: "generateEmbedding", fn: () => generateAndSaveEmbedding(id, title, msgs) },
    { name: "extractKnowledge", fn: () => extractKnowledgeCard(id, title, msgs) },
    { name: "autoLink", fn: () => autoLinkQASet(id), dependsOn: ["generateEmbedding"] },
    {
      name: "assignCluster",
      fn: async () => {
        const clusterId = await assignToCluster(id);
        if (clusterId) {
          await Promise.allSettled([
            recordContribution(userId, id, "question", title ?? undefined),
            suggestGapsToCreator(id, userId),
            checkAndResolveGaps(id, clusterId),
          ]);
        }
      },
      dependsOn: ["generateEmbedding"],
    },
    {
      name: "aggregateRelations",
      fn: () => aggregateClusterRelationsForQASet(id),
      dependsOn: ["autoLink", "assignCluster"],
    },
  ]);

  return NextResponse.json({
    success: true,
    creatorAuthorityStake,
    investAmount,
  });
}

// Claude를 이용해 한국어 + 영어 키워드 생성 후 저장
async function generateAndSaveKeywords(
  qaSetId: string,
  title: string | null,
  messages: { role: string; content: string }[]
) {
  try {
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

    const keywords =
      response.content[0].type === "text" ? response.content[0].text.trim() : "";

    if (keywords) {
      await prisma.qASet.update({
        where: { id: qaSetId },
        data: { searchKeywords: keywords },
      });
    }
  } catch {
    // 키워드 생성 실패해도 공유는 정상 완료됨
  }
}

// OpenAI 임베딩 생성 후 저장
async function generateAndSaveEmbedding(
  qaSetId: string,
  title: string | null,
  messages: { role: string; content: string }[]
) {
  try {
    if (!process.env.OPENAI_API_KEY) return;

    const text = assembleTextForEmbedding(title, messages);
    const embedding = await generateEmbedding(text);

    // Save both JSON text and pgvector native column
    const { saveEmbeddingToDb } = await import("@/lib/search/embedding");
    await saveEmbeddingToDb(prisma, qaSetId, embedding);
  } catch {
    // 임베딩 생성 실패해도 공유는 정상 완료됨
  }
}
