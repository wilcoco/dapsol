import Anthropic from "@anthropic-ai/sdk";

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeWithAI<T>(params: {
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<T | null> {
  try {
    const client = getClient();
    const response = await client.messages.create({
      model: params.model ?? "claude-haiku-4-5-20251001",
      max_tokens: params.maxTokens ?? 1024,
      messages: [{ role: "user", content: params.prompt }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const jsonStr = jsonMatch[1] ?? jsonMatch[0];
    return JSON.parse(jsonStr) as T;
  } catch (error) {
    console.error("AI analysis failed:", error);
    return null;
  }
}
