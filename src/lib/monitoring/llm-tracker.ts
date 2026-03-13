/**
 * LLM API 호출 추적기
 * 인메모리로 최근 호출 통계를 관리하고, API로 조회 가능
 */

interface LLMCall {
  provider: "anthropic" | "openai";
  model: string;
  purpose: string; // chat, embedding, keyword, hunt-verify, relation
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  timestamp: number;
  error?: string;
}

const MAX_HISTORY = 500;
const calls: LLMCall[] = [];

export function trackLLMCall(call: Omit<LLMCall, "timestamp">) {
  calls.push({ ...call, timestamp: Date.now() });
  if (calls.length > MAX_HISTORY) {
    calls.splice(0, calls.length - MAX_HISTORY);
  }
}

export function getLLMStats(windowMs = 24 * 60 * 60 * 1000) {
  const cutoff = Date.now() - windowMs;
  const recent = calls.filter((c) => c.timestamp >= cutoff);

  const byProvider: Record<string, { count: number; inputTokens: number; outputTokens: number; totalMs: number; errors: number }> = {};
  const byPurpose: Record<string, { count: number; inputTokens: number; outputTokens: number }> = {};

  for (const c of recent) {
    // By provider
    if (!byProvider[c.provider]) {
      byProvider[c.provider] = { count: 0, inputTokens: 0, outputTokens: 0, totalMs: 0, errors: 0 };
    }
    byProvider[c.provider].count++;
    byProvider[c.provider].inputTokens += c.inputTokens;
    byProvider[c.provider].outputTokens += c.outputTokens;
    byProvider[c.provider].totalMs += c.durationMs;
    if (c.error) byProvider[c.provider].errors++;

    // By purpose
    if (!byPurpose[c.purpose]) {
      byPurpose[c.purpose] = { count: 0, inputTokens: 0, outputTokens: 0 };
    }
    byPurpose[c.purpose].count++;
    byPurpose[c.purpose].inputTokens += c.inputTokens;
    byPurpose[c.purpose].outputTokens += c.outputTokens;
  }

  return {
    totalCalls: recent.length,
    windowMs,
    byProvider,
    byPurpose,
    recentErrors: recent.filter((c) => c.error).slice(-10).map((c) => ({
      provider: c.provider,
      purpose: c.purpose,
      error: c.error,
      timestamp: new Date(c.timestamp).toISOString(),
    })),
  };
}
