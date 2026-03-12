import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let dbConnected = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  return NextResponse.json({
    status: dbConnected ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    dbConnected,
    responseTimeMs: Date.now() - start,
    version: process.env.npm_package_version ?? "0.1.0",
  }, { status: dbConnected ? 200 : 503 });
}
