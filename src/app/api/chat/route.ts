import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectInsight } from "@/lib/knowledge/insight-detector";
import { findRelevantGaps } from "@/lib/knowledge/gap-context";
import { retrieveRelevantKnowledge, formatRAGContext } from "@/lib/chat/rag-context";
import { retrieveHumanKnowledge, formatHumanKnowledgeContext } from "@/lib/chat/human-knowledge-retrieval";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { trackLLMCall } from "@/lib/monitoring/llm-tracker";

// ─── Relation Tagging Tool (replaces [[REL:{...}]] regex parsing) ───

const RELATION_TOOL: Anthropic.Tool = {
  name: "tag_relation",
  description: "Tag the relationship between the user's follow-up question and the previous Q&A turn. Call this ONCE after answering.",
  input_schema: {
    type: "object" as const,
    properties: {
      simple: {
        type: "string",
        enum: ["명확화", "더깊게", "근거", "검증", "반박", "적용", "정리"],
        description: "명확화=clarifying, 더깊게=deeper, 근거=evidence, 검증=verify, 반박=counter, 적용=apply, 정리=summarize",
      },
      stance: {
        type: "string",
        enum: ["수용", "중립", "도전"],
        description: "User's attitude toward the previous answer",
      },
      q1q2: {
        type: "string",
        description: "Q1→Q2 question evolution type (재정식화|모호성해소|구체화|일반화|초점이동|분해|가정변경|비교|경계조건|메타)",
      },
      a1q2: {
        type: "string",
        description: "A1→Q2 answer trigger type (명확화요청|세부화|근거요구|검증|반박|정정|한계탐색|예시요청|적용|실행|요약|함의)",
      },
    },
    required: ["simple", "stance"],
  },
};

export async function POST(req: NextRequest) {
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const session = await auth();
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { qaSetId, messages, systemPrompt } = await req.json();

    if (!qaSetId || !messages || !Array.isArray(messages)) {
      return new Response("Bad request", { status: 400 });
    }

    const qaSet = await prisma.qASet.findUnique({ where: { id: qaSetId } });
    if (!qaSet) return new Response("QA set not found", { status: 404 });
    if (qaSet.creatorId !== session.user.id) {
      return new Response("Unauthorized: not your Q&A set", { status: 403 });
    }

    // Save user message
    const userMessage = messages[messages.length - 1];
    let savedUserMessageId: string | null = null;

    if (userMessage?.role === "user") {
      const lastAssistantWithGap = await prisma.message.findFirst({
        where: { qaSetId, role: "assistant", gapQuestionId: { not: null } },
        orderBy: { orderIndex: "desc" },
        select: { gapQuestionId: true },
      });

      const messageCount = await prisma.message.count({ where: { qaSetId } });
      const saved = await prisma.message.create({
        data: {
          qaSetId,
          role: "user",
          content: userMessage.content,
          orderIndex: messageCount,
          isGapResponse: !!lastAssistantWithGap?.gapQuestionId,
          gapQuestionId: lastAssistantWithGap?.gapQuestionId ?? undefined,
        },
      });
      savedUserMessageId = saved.id;

      if (!qaSet.title || qaSet.title === "") {
        await prisma.qASet.update({
          where: { id: qaSetId },
          data: { title: userMessage.content.slice(0, 100) },
        });
      }
    }

    // Follow-up detection
    const isFollowUp = messages.filter((m: { role: string }) => m.role === "user").length > 1;
    const firstUserContent = messages.find((m: { role: string }) => m.role === "user")?.content ?? "";
    const userMessageCount = messages.filter((m: { role: string }) => m.role === "user").length;

    // Knowledge gap context
    let gapInstructions = "";
    let activeGapId: string | null = null;

    const shouldCheckGaps = userMessageCount === 1
      || (userMessageCount <= 10 && userMessageCount % 3 === 0)
      || (userMessageCount > 10 && userMessageCount % 5 === 0);

    if (shouldCheckGaps) {
      try {
        const gapContext = await findRelevantGaps(firstUserContent);
        if (gapContext && gapContext.gaps.length > 0) {
          activeGapId = gapContext.gaps[0].id;
          const gapList = gapContext.gaps.map(g => `- [${g.severity}] ${g.description}`).join("\n");
          gapInstructions = `

KNOWLEDGE GAP CONTEXT:
The community is exploring the topic "${gapContext.clusterName}" and has identified these knowledge gaps where human expertise is needed:
${gapList}

INSTRUCTIONS FOR KNOWLEDGE GAPS:
- If the user's question or expertise seems related to any of these gaps, NATURALLY ask them about it at the end of your answer.
- Frame it as genuine curiosity: "한 가지 여쭤봐도 될까요? 이 주제에서 ..." or "혹시 직접 경험해보신 적이 있으신가요?"
- Do NOT ask about gaps if they are unrelated to the current conversation.
- Do NOT ask about gaps in every response — only when it feels natural.
- Keep the gap question brief (1-2 sentences) and separate it with a blank line.
- Mark the gap question with [[GAP_QUESTION]] tag at the very end (this will be stripped from display).`;
        }
      } catch (err) {
        console.error("Failed to find relevant gaps:", err);
      }
    }

    // RAG context (existing Q&A knowledge cards)
    let ragContext = "";
    if (userMessageCount === 1 || userMessageCount % 3 === 0) {
      try {
        const ragResults = await retrieveRelevantKnowledge(
          userMessage?.content ?? firstUserContent, qaSetId, 3,
        );
        ragContext = formatRAGContext(ragResults);
      } catch (err) {
        console.error("RAG context retrieval failed:", err);
      }
    }

    // Human Knowledge context (insights, human-authored answers, opinions)
    let humanKnowledgeContext = "";
    if (userMessageCount === 1 || userMessageCount % 2 === 0) {
      try {
        const humanKnowledge = await retrieveHumanKnowledge(
          userMessage?.content ?? firstUserContent,
          {
            excludeQASetId: qaSetId,
            maxResults: 3,
            minSimilarity: 0.35,
            includeInsights: true,
            includeOpinions: true,
            includeHumanAnswers: true,
          }
        );
        humanKnowledgeContext = formatHumanKnowledgeContext(humanKnowledge);
      } catch (err) {
        console.error("Human knowledge retrieval failed:", err);
      }
    }

    const finalSystem =
      (systemPrompt || "You are a helpful AI assistant. Respond in the same language as the user's question.") +
      ragContext + humanKnowledgeContext + gapInstructions +
      (isFollowUp ? "\n\nAfter answering, use the tag_relation tool to classify the relationship of this follow-up question." : "");

    // Fix human-authored assistant messages
    const dbMessages = await prisma.message.findMany({
      where: { qaSetId },
      select: { content: true, isHumanAuthored: true },
      orderBy: { orderIndex: "asc" },
    });
    const humanAuthoredContents = new Set(
      dbMessages.filter(m => m.isHumanAuthored).map(m => m.content),
    );

    const transformedMessages = messages.map((m: { role: string; content: string }) => {
      if (m.role === "assistant" && humanAuthoredContents.has(m.content)) {
        return { role: "user" as const, content: `[다른 사용자의 답변]: ${m.content}` };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        (async () => {
          let fullContent = "";
          let relationData: { simple?: string; stance?: string; q1q2?: string; a1q2?: string } | null = null;
          const llmStartTime = Date.now();

          try {
            const response = await anthropic.messages.create({
              model: "claude-sonnet-4-20250514",
              max_tokens: 4096,
              system: finalSystem,
              messages: transformedMessages,
              stream: true,
              ...(isFollowUp ? { tools: [RELATION_TOOL] } : {}),
            });

            let currentToolInput = "";
            let inToolUse = false;

            for await (const event of response) {
              if (event.type === "content_block_start") {
                if (event.content_block.type === "tool_use") {
                  inToolUse = true;
                  currentToolInput = "";
                }
              } else if (event.type === "content_block_delta") {
                if ("text" in event.delta) {
                  // Stream text to client
                  fullContent += event.delta.text;
                  controller.enqueue(encoder.encode(event.delta.text));
                } else if ("partial_json" in event.delta && inToolUse) {
                  currentToolInput += event.delta.partial_json;
                }
              } else if (event.type === "content_block_stop" && inToolUse) {
                inToolUse = false;
                try {
                  relationData = JSON.parse(currentToolInput);
                } catch {
                  console.warn("[Chat] Failed to parse tool_use input:", currentToolInput);
                }
              }
            }

            // Strip GAP_QUESTION tag
            const hasGapQuestion = fullContent.includes("[[GAP_QUESTION]]");
            const cleanContent = fullContent.replace(/\[\[GAP_QUESTION\]\]/g, "").trim();

            // Save assistant message
            if (cleanContent) {
              const messageCount = await prisma.message.count({ where: { qaSetId } });
              await prisma.message.create({
                data: {
                  qaSetId,
                  role: "assistant",
                  content: cleanContent,
                  orderIndex: messageCount,
                  gapQuestionId: hasGapQuestion && activeGapId ? activeGapId : undefined,
                },
              });
            }

            // Save relation labels from tool_use
            if (relationData && savedUserMessageId) {
              await prisma.message.update({
                where: { id: savedUserMessageId },
                data: {
                  relationSimple: relationData.simple ?? null,
                  relationQ1Q2: relationData.q1q2 ?? null,
                  relationA1Q2: relationData.a1q2 ?? null,
                  relationStance: relationData.stance ?? null,
                },
              });
            }

            // Track LLM call
            trackLLMCall({
              provider: "anthropic",
              model: "claude-sonnet-4-20250514",
              purpose: "chat",
              inputTokens: Math.ceil(finalSystem.length / 4 + transformedMessages.reduce((s: number, m: any) => s + (m.content?.length ?? 0), 0) / 4),
              outputTokens: Math.ceil(fullContent.length / 4),
              durationMs: Date.now() - llmStartTime,
            });

            // Detect insights
            if (savedUserMessageId && isFollowUp) {
              const contextForInsight = messages.slice(-4).map((m: { role: string; content: string }) =>
                `${m.role}: ${m.content.slice(0, 300)}`
              ).join("\n");
              detectInsight(savedUserMessageId, userMessage.content, contextForInsight).catch(console.error);
            }
          } catch (error) {
            console.error("Chat route error:", error);
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            controller.enqueue(encoder.encode(`\n\n[오류가 발생했습니다: ${errMsg}]`));
          } finally {
            controller.close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("Chat route top-level error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
