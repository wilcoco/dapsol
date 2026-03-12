import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { detectInsight } from "@/lib/knowledge/insight-detector";
import { findRelevantGaps } from "@/lib/knowledge/gap-context";
import { parseRelationTag, stripTags } from "@/lib/chat/relation-parser";
import { retrieveRelevantKnowledge, formatRAGContext } from "@/lib/chat/rag-context";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";

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

  // 사용자 메시지 저장
  const userMessage = messages[messages.length - 1];
  let savedUserMessageId: string | null = null;

  if (userMessage?.role === "user") {
    // 이전 AI 메시지가 갭 질문을 했는지 확인
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
        // 이전 AI가 갭 질문을 했으면, 이 응답을 갭 응답으로 마킹
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

  // 후속 질문 여부 (첫 질문이면 관계 라벨 불필요)
  const isFollowUp = messages.filter((m: { role: string }) => m.role === "user").length > 1;

  // 후속 질문일 때만 관계 태그 지시 추가
  const relInstructions = isFollowUp
    ? `

After your answer, on a new line add a relation tag:
[[REL:{"simple":"배지","q1q2":"유형","a1q2":"유형","stance":"입장"}]]

simple — ONE of: 명확화|더깊게|근거|검증|반박|적용|정리
  명확화=clarifying terms/scope, 더깊게=drill deeper, 근거=requesting evidence
  검증=verifying consistency, 반박=challenging/counterargument
  적용=applying to context, 정리=summarize/reformat

q1q2 (Q1→Q2 question evolution) — ONE of:
  재정식화|모호성해소|구체화|일반화|초점이동|분해|가정변경|비교|경계조건|메타

a1q2 (A1→Q2 answer trigger) — ONE of:
  명확화요청|세부화|근거요구|검증|반박|정정|한계탐색|예시요청|적용|실행|요약|함의

stance (user's attitude toward previous answer) — ONE of: 수용|중립|도전

Example: [[REL:{"simple":"근거","q1q2":"구체화","a1q2":"근거요구","stance":"도전"}]]`
    : "";

  // Find relevant knowledge gaps for this conversation's topic
  const firstUserContent = messages.find((m: {role: string}) => m.role === "user")?.content ?? "";
  const userMessageCount = messages.filter((m: {role: string}) => m.role === "user").length;

  let gapInstructions = "";
  let activeGapId: string | null = null; // 현재 대화에서 활성화된 갭 ID

  // Dynamic gap injection: first message, every 3rd message, but less frequently after 10 messages
  const shouldCheckGaps = userMessageCount === 1
    || (userMessageCount <= 10 && userMessageCount % 3 === 0)
    || (userMessageCount > 10 && userMessageCount % 5 === 0);
  if (shouldCheckGaps) {
    try {
      const gapContext = await findRelevantGaps(firstUserContent);
      if (gapContext && gapContext.gaps.length > 0) {
        activeGapId = gapContext.gaps[0].id; // 가장 심각한 갭 추적
        const gapList = gapContext.gaps.map(g => `- [${g.severity}] ${g.description}`).join("\n");
        gapInstructions = `

KNOWLEDGE GAP CONTEXT:
The community is exploring the topic "${gapContext.clusterName}" and has identified these knowledge gaps where human expertise is needed:
${gapList}

INSTRUCTIONS FOR KNOWLEDGE GAPS:
- If the user's question or expertise seems related to any of these gaps, NATURALLY ask them about it at the end of your answer.
- Frame it as genuine curiosity: "한 가지 여쭤봐도 될까요? 이 주제에서 ..." or "혹시 직접 경험해보신 적이 있으신가요?"
- Do NOT ask about gaps if they are unrelated to the current conversation.
- Do NOT ask about gaps in every response — only when it feels natural and the user seems to have relevant experience.
- Keep the gap question brief (1-2 sentences) and separate it with a blank line from the main answer.
- Mark the gap question with [[GAP_QUESTION]] tag at the very end (this will be stripped from display).`;
      }
    } catch (err) {
      console.error("Failed to find relevant gaps:", err);
    }
  }

  // RAG: Retrieve relevant knowledge from the community knowledge base
  let ragContext = "";
  if (userMessageCount === 1 || userMessageCount % 3 === 0) {
    try {
      const ragResults = await retrieveRelevantKnowledge(
        userMessage?.content ?? firstUserContent,
        qaSetId,
        3
      );
      ragContext = formatRAGContext(ragResults);
    } catch (err) {
      console.error("RAG context retrieval failed:", err);
    }
  }

  const finalSystem =
    (systemPrompt ||
      "You are a helpful AI assistant. Respond in the same language as the user's question.") +
    ragContext +
    gapInstructions +
    relInstructions;

  const anthropicMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Fix human answer role confusion: convert isHumanAuthored assistant messages to user role
  const dbMessages = await prisma.message.findMany({
    where: { qaSetId },
    select: { content: true, isHumanAuthored: true, role: true, orderIndex: true },
    orderBy: { orderIndex: "asc" },
  });
  const humanAuthoredContents = new Set(
    dbMessages.filter(m => m.isHumanAuthored).map(m => m.content)
  );

  const transformedMessages: Array<{ role: "user" | "assistant"; content: string }> = anthropicMessages.map((m) => {
    if (m.role === "assistant" && humanAuthoredContents.has(m.content)) {
      return {
        role: "user" as const,
        content: `[다른 사용자의 답변]: ${m.content}`,
      };
    }
    return { role: m.role, content: m.content };
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      (async () => {
        let fullContent = "";

        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: finalSystem,
            messages: transformedMessages,
            stream: true,
          });

          for await (const event of response) {
            if (event.type === "content_block_delta" && "text" in event.delta) {
              fullContent += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }

          // 관계 태그 파싱 & 본문 정리
          const relation = isFollowUp ? parseRelationTag(fullContent) : null;
          const cleanContent = stripTags(fullContent);

          // GAP_QUESTION 태그 감지 → 이 assistant 메시지가 갭 질문을 포함
          const hasGapQuestion = fullContent.includes("[[GAP_QUESTION]]");

          if (cleanContent) {
            const messageCount = await prisma.message.count({ where: { qaSetId } });
            await prisma.message.create({
              data: {
                qaSetId,
                role: "assistant",
                content: cleanContent,
                orderIndex: messageCount,
                // 갭 질문을 했으면 어떤 갭에 대한 것인지 추적
                gapQuestionId: hasGapQuestion && activeGapId ? activeGapId : undefined,
              },
            });
          }

          // 후속 질문 메시지에 관계 라벨 저장
          if (relation && savedUserMessageId) {
            await prisma.message.update({
              where: { id: savedUserMessageId },
              data: {
                relationSimple: relation.simple,
                relationQ1Q2: relation.q1q2,
                relationA1Q2: relation.a1q2,
                relationStance: relation.stance,
              },
            });
          }

          // After saving relation labels, detect insights on the user message
          if (savedUserMessageId && isFollowUp) {
            const contextForInsight = messages.slice(-4).map((m: {role: string; content: string}) =>
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
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
