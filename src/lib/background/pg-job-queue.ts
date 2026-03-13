/**
 * PostgreSQL-backed Job Queue
 *
 * Replaces the in-memory job queue with persistent storage.
 * Jobs survive server restarts and can be retried.
 *
 * Uses SELECT FOR UPDATE SKIP LOCKED for concurrent worker safety.
 */

import { prisma } from "@/lib/prisma";

const RETRY_DELAYS_MS = [1000, 5000, 15000]; // backoff delays
const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 min - consider job stale after this
const POLL_INTERVAL_MS = 2000; // how often to check for ready jobs

// ─── Job Registration ───

type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

/**
 * Register a named job handler.
 * Must be called at app startup before jobs are processed.
 */
export function registerJobHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

// ─── Enqueue ───

interface JobDefinition {
  name: string;
  payload?: Record<string, unknown>;
  dependsOn?: string[];
  maxRetries?: number;
}

/**
 * Enqueue a batch of jobs for a given context (e.g. QASet ID).
 * Jobs are inserted as "pending" rows in the BackgroundJob table.
 *
 * After insertion, triggers processing (non-blocking).
 */
export async function enqueueJobs(contextId: string, jobs: JobDefinition[]): Promise<void> {
  await prisma.backgroundJob.createMany({
    data: jobs.map((job) => ({
      contextId,
      name: job.name,
      payload: job.payload ? JSON.stringify(job.payload) : null,
      dependsOn: job.dependsOn ? JSON.stringify(job.dependsOn) : null,
      maxRetries: job.maxRetries ?? 3,
      status: "pending",
    })),
  });

  // Trigger processing asynchronously
  processReadyJobs(contextId).catch((err) => {
    console.error(`[PgJobQueue] Failed to start processing for ${contextId}:`, err);
  });
}

// ─── Processing ───

/**
 * Process all ready jobs for a context in dependency order.
 * Uses SELECT FOR UPDATE SKIP LOCKED to prevent double-processing.
 */
async function processReadyJobs(contextId: string): Promise<void> {
  const maxIterations = 20; // safety limit

  for (let i = 0; i < maxIterations; i++) {
    // Find all jobs in this context
    const allJobs = await prisma.backgroundJob.findMany({
      where: { contextId },
      select: { id: true, name: true, status: true, dependsOn: true, runAfter: true },
    });

    const completedNames = new Set(
      allJobs.filter((j) => j.status === "completed").map((j) => j.name)
    );

    // Find ready jobs: pending, dependencies met, runAfter passed
    const now = new Date();
    const readyJobs = allJobs.filter((j) => {
      if (j.status !== "pending") return false;
      if (j.runAfter > now) return false;
      if (j.dependsOn) {
        const deps: string[] = JSON.parse(j.dependsOn);
        return deps.every((d) => completedNames.has(d));
      }
      return true;
    });

    if (readyJobs.length === 0) {
      // Check if there are still running or pending jobs
      const hasRunningOrPending = allJobs.some(
        (j) => j.status === "running" || j.status === "pending"
      );
      if (hasRunningOrPending) {
        // Wait briefly and retry (a running job may complete)
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        continue;
      }
      break; // All done
    }

    // Process ready jobs in parallel
    await Promise.allSettled(
      readyJobs.map((job) => processJob(job.id))
    );
  }
}

/**
 * Lock and execute a single job.
 * Uses raw SQL with FOR UPDATE SKIP LOCKED for safe concurrency.
 */
async function processJob(jobId: string): Promise<void> {
  // Attempt to lock the job atomically
  const locked = await prisma.$executeRaw`
    UPDATE "BackgroundJob"
    SET status = 'running', "lockedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = ${jobId} AND status = 'pending'
  `;

  if (locked === 0) return; // Already claimed by another worker

  const job = await prisma.backgroundJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  const handler = handlers.get(job.name);
  if (!handler) {
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "failed", error: `No handler registered for "${job.name}"` },
    });
    console.error(`[PgJobQueue] No handler for job "${job.name}" (context: ${job.contextId})`);
    return;
  }

  try {
    const payload = job.payload ? JSON.parse(job.payload) : {};
    await handler(payload);

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "completed", completedAt: new Date(), error: null },
    });

    console.log(`[PgJobQueue] ${job.contextId}/${job.name}: completed (attempt ${job.attempts + 1})`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;

    if (attempts >= job.maxRetries) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: "failed", error: errorMsg, attempts },
      });
      console.error(`[PgJobQueue] ${job.contextId}/${job.name}: failed after ${attempts} attempts — ${errorMsg}`);
    } else {
      // Schedule retry with backoff
      const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: "pending",
          error: errorMsg,
          attempts,
          lockedAt: null,
          runAfter: new Date(Date.now() + delay),
        },
      });
      console.warn(`[PgJobQueue] ${job.contextId}/${job.name}: attempt ${attempts} failed, retrying in ${delay}ms`);
    }
  }
}

// ─── Recovery ───

/**
 * Recover stale jobs (locked but not completed within timeout).
 * Call this on app startup to handle jobs that were running when server crashed.
 */
export async function recoverStaleJobs(): Promise<number> {
  const staleThreshold = new Date(Date.now() - LOCK_TIMEOUT_MS);

  const result = await prisma.backgroundJob.updateMany({
    where: {
      status: "running",
      lockedAt: { lt: staleThreshold },
    },
    data: {
      status: "pending",
      lockedAt: null,
    },
  });

  if (result.count > 0) {
    console.log(`[PgJobQueue] Recovered ${result.count} stale jobs`);

    // Get unique contexts of recovered jobs and trigger processing
    const staleJobs = await prisma.backgroundJob.findMany({
      where: { status: "pending" },
      select: { contextId: true },
      distinct: ["contextId"],
    });

    for (const { contextId } of staleJobs) {
      processReadyJobs(contextId).catch(console.error);
    }
  }

  return result.count;
}

/**
 * Clean up completed/failed jobs older than the given age.
 */
export async function cleanupOldJobs(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const threshold = new Date(Date.now() - maxAgeMs);
  const result = await prisma.backgroundJob.deleteMany({
    where: {
      status: { in: ["completed", "failed"] },
      updatedAt: { lt: threshold },
    },
  });
  return result.count;
}
