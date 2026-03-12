import { analyzeWithAI } from "./ai-analysis";
import { prisma } from "@/lib/prisma";

interface InsightResult {
  isInsight: boolean;
  reason: string;
}

// 짧거나 단순한 메시지는 AI 호출 없이 스킵 (비용 절약)
const SKIP_PATTERNS = /^(네|아니오|감사합니다|고마워|알겠|ㅇㅇ|ㅋ|ㅎ|ok|yes|no|thanks|thank you|got it|sure)[\s.!?]*$/i;

export async function detectInsight(messageId: string, userContent: string, conversationContext: string): Promise<void> {
  // 50자 미만이거나 단순 응답이면 스킵
  if (userContent.trim().length < 50 || SKIP_PATTERNS.test(userContent.trim())) return;

  const result = await analyzeWithAI<InsightResult>({
    prompt: `You are evaluating whether a user's message contains "human-unique knowledge" — information that goes beyond what an AI would typically know from its training data.

Context of the conversation so far:
${conversationContext}

User's message to evaluate:
${userContent}

Look for:
- Personal experience, domain-specific unpublished knowledge
- Corrections to AI errors based on real-world expertise
- Novel reasoning or creative connections AI wouldn't make
- Specific data, measurements, or observations not in public literature
- Cultural, local, or practical knowledge from lived experience

Respond in JSON:
{"isInsight": true/false, "reason": "Brief Korean explanation of why this is/isn't human-unique knowledge"}

If the message is just a simple follow-up question or generic statement, isInsight should be false.`,
  });

  if (result?.isInsight) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        isInsight: true,
        insightReason: result.reason,
        insightDetectedAt: new Date(),
      },
    });
  }
}
