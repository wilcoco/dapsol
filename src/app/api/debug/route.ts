import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? `${process.env.DATABASE_URL.substring(0, 20)}...` : "NOT SET",
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ? "SET" : "NOT SET",
      AUTH_SECRET: process.env.AUTH_SECRET ? `SET (${process.env.AUTH_SECRET.length} chars)` : "NOT SET",
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "NOT SET",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "SET" : "NOT SET",
      NODE_ENV: process.env.NODE_ENV,
    },
  });
}
