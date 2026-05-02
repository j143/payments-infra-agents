/**
 * Async Worker Entry Point
 *
 * Runs in a separate process to process queued transactions.
 */

import "dotenv/config";
import { logger } from "./api/middleware/logger";
import { jobQueueService } from "./services/job-queue.service";

const workerId = process.env.WORKER_ID || `worker-${process.pid}`;
const pollIntervalMs = parseInt(process.env.JOB_POLL_INTERVAL_MS || "5000", 10);
let isPolling = false;

async function drainQueue() {
  if (isPolling) {
    return;
  }

  isPolling = true;
  try {
    while (true) {
      const job = await jobQueueService.processNextJob(workerId);
      if (!job) {
        break;
      }
    }
  } finally {
    isPolling = false;
  }
}

logger.log("Worker started", {
  workerId,
  pollIntervalMs,
});

void drainQueue();

setInterval(() => {
  void drainQueue().catch((error) => {
    logger.error("Worker poll failed", {
      workerId,
      error: error instanceof Error ? error.message : "unknown error",
    });
  });
}, pollIntervalMs);