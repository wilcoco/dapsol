import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * 표준 성공 응답
 */
export function success<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * 표준 에러 응답
 */
export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * 인증 실패 응답
 */
export function unauthorized(message = "인증이 필요합니다.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * 권한 없음 응답
 */
export function forbidden(message = "권한이 없습니다.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * 리소스 없음 응답
 */
export function notFound(message = "리소스를 찾을 수 없습니다.") {
  return NextResponse.json({ error: message }, { status: 404 });
}

/**
 * Zod 검증 에러 → 400 응답
 */
export function validationError(err: ZodError) {
  const messages = err.issues.map((e) => `${e.path.join(".")}: ${e.message}`);
  return NextResponse.json(
    { error: "입력값이 올바르지 않습니다.", details: messages },
    { status: 400 }
  );
}

/**
 * 서버 에러 응답 (에러를 콘솔에 로깅)
 */
export function serverError(err: unknown, context?: string) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[ServerError]${context ? ` ${context}:` : ""}`, message);
  return NextResponse.json(
    { error: "서버 오류가 발생했습니다." },
    { status: 500 }
  );
}
