import { analyzeWithAI } from "./ai-analysis";
import { prisma } from "@/lib/prisma";

interface KnowledgeCard {
  coreClaim: string;
  evidence: string[];
  conditions: string[];
  limitations: string[];
  confidence: "high" | "medium" | "low";
}

export async function extractKnowledgeCard(
  qaSetId: string,
  title: string | null,
  messages: { role: string; content: string }[]
): Promise<void> {
  const conversation = messages
    .slice(0, 10)
    .map((m) => `${m.role === "user" ? "질문" : "답변"}: ${m.content.slice(0, 500)}`)
    .join("\n\n");

  const result = await analyzeWithAI<KnowledgeCard>({
    prompt: `다음 Q&A 대화에서 핵심 지식을 구조화하여 추출하세요.

제목: ${title ?? "없음"}

${conversation}

JSON으로 응답하세요:
{
  "coreClaim": "이 대화의 핵심 주장 또는 결론 (1~2문장, 한국어)",
  "evidence": ["근거1", "근거2", ...],
  "conditions": ["이 지식이 성립하는 조건/전제1", ...],
  "limitations": ["한계점/주의사항1", ...],
  "confidence": "high|medium|low"
}

배열이 비어도 괜찮습니다. 핵심만 간결하게.`,
    model: "claude-haiku-4-5-20251001",
  });

  if (result) {
    const card = { ...result, extractedAt: new Date().toISOString() };
    await prisma.qASet.update({
      where: { id: qaSetId },
      data: { knowledgeCard: JSON.stringify(card) },
    });
  }
}
