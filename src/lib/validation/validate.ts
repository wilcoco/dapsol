import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; response: NextResponse };

export async function validateBody<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): Promise<ValidationResult<T>> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return {
        success: false,
        response: NextResponse.json(
          {
            error: "입력값이 올바르지 않습니다.",
            details: result.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            })),
          },
          { status: 400 }
        ),
      };
    }
    return { success: true, data: result.data };
  } catch {
    return {
      success: false,
      response: NextResponse.json(
        { error: "요청 본문을 파싱할 수 없습니다." },
        { status: 400 }
      ),
    };
  }
}
