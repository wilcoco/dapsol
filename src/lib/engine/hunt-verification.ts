/**
 * Hunt Verification
 * Uses AI to verify hunting evidence against the Q&A content.
 */

import Anthropic from "@anthropic-ai/sdk";

interface HuntVerificationResult {
  isValid: boolean;
  confidence: number;
  explanation: string;
}

export async function verifyHuntingEvidence(
  qaContent: string,
  huntingReason: string,
  huntingEvidence: string
): Promise<HuntVerificationResult> {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // If no API key, allow hunt (fail open)
      return { isValid: true, confidence: 0, explanation: "AI 검증 불가 (API 키 없음)" };
    }

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: `You are a fact-checker. Evaluate whether a user's criticism of AI-generated content is valid.
Return JSON: {"isValid": boolean, "confidence": 0-1, "explanation": "한국어 설명"}
Be fair — if the criticism has any merit, mark as valid. Only reject clearly irrelevant or nonsensical criticisms.`,
      messages: [{
        role: "user",
        content: `## AI 답변 내용:
${qaContent.slice(0, 2000)}

## 반대 사유: ${huntingReason}
## 반대 근거: ${huntingEvidence}

이 비판이 타당한지 평가해주세요.`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          isValid: result.isValid !== false,
          confidence: Math.min(1, Math.max(0, result.confidence ?? 0.5)),
          explanation: result.explanation ?? "",
        };
      }
    } catch {}

    return { isValid: true, confidence: 0.5, explanation: "검증 결과 파싱 실패 — 허용" };
  } catch (err) {
    console.error("[HuntVerification] Error:", err);
    return { isValid: true, confidence: 0, explanation: "검증 중 오류 — 허용" };
  }
}
