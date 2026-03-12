/**
 * Robust relation tag parser for AI responses.
 * Handles various formats and malformed tags gracefully.
 */

export interface ParsedRelation {
  simple: string | null;
  q1q2: string | null;
  a1q2: string | null;
  stance: string | null;
}

const VALID_SIMPLE = new Set([
  "명확화", "더깊게", "근거", "검증", "반박", "적용", "정리"
]);

const VALID_STANCE = new Set(["수용", "중립", "도전"]);

/**
 * Parse relation tag from AI response text.
 * Tries multiple patterns and validates values.
 */
export function parseRelationTag(text: string): ParsedRelation | null {
  // Pattern 1: Standard [[REL:{...}]]
  let match = text.match(/\[\[REL:(\{[\s\S]*?\})\]\]/);

  // Pattern 2: [[RELATION:{...}]]
  if (!match) {
    match = text.match(/\[\[RELATION:(\{[\s\S]*?\})\]\]/);
  }

  // Pattern 3: Loose JSON after [[REL: (unclosed bracket)
  if (!match) {
    match = text.match(/\[\[REL:\s*(\{[\s\S]*?\})/);
  }

  if (!match) return null;

  try {
    // Try standard JSON parse first
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(match[1]);
    } catch {
      // Try fixing common JSON issues: single quotes, trailing commas
      const fixed = match[1]
        .replace(/'/g, '"')
        .replace(/,\s*\}/g, "}")
        .replace(/,\s*\]/g, "]");
      obj = JSON.parse(fixed);
    }

    const result: ParsedRelation = {
      simple: typeof obj.simple === "string" ? obj.simple : null,
      q1q2: typeof obj.q1q2 === "string" ? obj.q1q2 : null,
      a1q2: typeof obj.a1q2 === "string" ? obj.a1q2 : null,
      stance: typeof obj.stance === "string" ? obj.stance : null,
    };

    // Validate simple value
    if (result.simple && !VALID_SIMPLE.has(result.simple)) {
      console.warn(`[RelationParser] Unknown simple value: "${result.simple}"`);
      // Don't reject — allow new values to pass through
    }

    // Validate stance value
    if (result.stance && !VALID_STANCE.has(result.stance)) {
      console.warn(`[RelationParser] Unknown stance value: "${result.stance}"`);
    }

    // Return null only if everything is null
    if (!result.simple && !result.q1q2 && !result.a1q2 && !result.stance) {
      return null;
    }

    return result;
  } catch (err) {
    console.error("[RelationParser] Failed to parse relation tag:", match[1], err);
    return null;
  }
}

/**
 * Strip all relation and system tags from AI response text for display.
 */
export function stripTags(text: string): string {
  return text
    .replace(/\[\[REL:\{[\s\S]*?\}\]\]/g, "")
    .replace(/\[\[RELATION:\{[\s\S]*?\}\]\]/g, "")
    .replace(/\[\[REL:\s*\{[\s\S]*?\}/g, "")
    .replace(/\[\[GAP_QUESTION\]\]/g, "")
    .trim();
}
