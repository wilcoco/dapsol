import { prisma } from "@/lib/prisma";
import { checkPgvectorStatus } from "@/lib/search/embedding";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const start = Date.now();
  let dbConnected = false;
  let tablesExist = false;
  let userCount = -1;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  if (dbConnected) {
    try {
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint as count FROM "User"`;
      tablesExist = true;
      userCount = Number(result[0]?.count ?? 0);
    } catch {
      tablesExist = false;
    }
  }

  // pgvector status
  const pgvector = dbConnected ? await checkPgvectorStatus(prisma) : null;

  // Pending background jobs
  let pendingJobs = 0;
  if (dbConnected && tablesExist) {
    try {
      const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint as count FROM "BackgroundJob" WHERE status IN ('pending', 'running')
      `;
      pendingJobs = Number(result[0]?.count ?? 0);
    } catch {
      // BackgroundJob table may not exist yet
    }
  }

  return NextResponse.json({
    status: dbConnected ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    dbConnected,
    tablesExist,
    userCount,
    pgvector,
    pendingJobs,
    responseTimeMs: Date.now() - start,
    version: process.env.npm_package_version ?? "0.1.0",
  }, { status: 200 });
}
