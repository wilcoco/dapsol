/**
 * Simple in-memory job queue with dependency ordering and retry logic.
 * Replaces fragile setTimeout chains in share route.
 */

interface Job {
  name: string;
  fn: () => Promise<void>;
  dependsOn?: string[];
  maxRetries?: number;
}

interface JobResult {
  name: string;
  status: "completed" | "failed";
  error?: string;
  attempts: number;
}

const RETRY_DELAYS = [1000, 3000, 8000]; // exponential-ish backoff

async function runJobWithRetry(job: Job): Promise<JobResult> {
  const maxRetries = job.maxRetries ?? 3;
  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await job.fn();
      return { name: job.name, status: "completed", attempts: attempt };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.error(`[JobQueue] ${job.name} attempt ${attempt}/${maxRetries} failed:`, lastError);

      if (attempt < maxRetries) {
        const delay = RETRY_DELAYS[Math.min(attempt - 1, RETRY_DELAYS.length - 1)];
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return { name: job.name, status: "failed", error: lastError, attempts: maxRetries };
}

/**
 * Enqueue and execute jobs with dependency ordering.
 * Jobs without dependencies run in parallel.
 * Jobs with dependencies wait for all dependencies to complete.
 *
 * Runs in background (non-blocking) — caller does not await.
 */
export function enqueueJobs(contextId: string, jobs: Job[]): void {
  // Fire and forget — errors are logged, not thrown
  executeJobs(contextId, jobs).catch((err) => {
    console.error(`[JobQueue] Fatal error for context ${contextId}:`, err);
  });
}

async function executeJobs(contextId: string, jobs: Job[]): Promise<JobResult[]> {
  const results = new Map<string, JobResult>();
  const completed = new Set<string>();

  // Topological execution: keep running batches until all jobs are done or no progress
  let remaining = [...jobs];

  while (remaining.length > 0) {
    // Find jobs whose dependencies are all completed
    const ready = remaining.filter((job) => {
      if (!job.dependsOn || job.dependsOn.length === 0) return true;
      return job.dependsOn.every((dep) => completed.has(dep));
    });

    if (ready.length === 0) {
      // No jobs can run — circular dependency or failed dependency
      for (const job of remaining) {
        const result: JobResult = {
          name: job.name,
          status: "failed",
          error: "Dependency not met (failed or circular)",
          attempts: 0,
        };
        results.set(job.name, result);
        console.error(`[JobQueue] ${contextId}/${job.name}: skipped — dependency not met`);
      }
      break;
    }

    // Run all ready jobs in parallel
    const batchResults = await Promise.allSettled(
      ready.map((job) => runJobWithRetry(job))
    );

    for (let i = 0; i < ready.length; i++) {
      const settledResult = batchResults[i];
      const jobResult = settledResult.status === "fulfilled"
        ? settledResult.value
        : { name: ready[i].name, status: "failed" as const, error: "Unexpected rejection", attempts: 0 };

      results.set(jobResult.name, jobResult);
      completed.add(jobResult.name);

      if (jobResult.status === "completed") {
        console.log(`[JobQueue] ${contextId}/${jobResult.name}: completed (${jobResult.attempts} attempts)`);
      } else {
        console.error(`[JobQueue] ${contextId}/${jobResult.name}: failed after ${jobResult.attempts} attempts — ${jobResult.error}`);
      }
    }

    // Remove completed jobs from remaining
    const readyNames = new Set(ready.map((j) => j.name));
    remaining = remaining.filter((j) => !readyNames.has(j.name));
  }

  return Array.from(results.values());
}
