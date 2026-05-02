/**
 * Job Queue Repository
 *
 * Stores and claims async work items for transaction processing.
 */

import { sql } from "../connection";
import {
  ApplicationError,
  CreateJobQueueItemRequest,
  ErrorCode,
  JobQueueItem,
} from "../../types";

export const jobQueueRepository = {
  async create(request: CreateJobQueueItemRequest): Promise<JobQueueItem> {
    try {
      const result = await sql`
        INSERT INTO job_queue (
          transaction_id,
          job_type,
          status,
          payload,
          available_at,
          max_attempts
        ) VALUES (
          ${request.transaction_id},
          ${request.job_type},
          'queued',
          ${JSON.stringify(request.payload || {})},
          ${request.available_at || new Date()},
          ${request.max_attempts || 3}
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create job queue item",
          500
        );
      }

      return this.rowToJob(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create job queue item: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async claimNext(workerId: string): Promise<JobQueueItem | null> {
    try {
      return await sql.begin(async (tx: any) => {
        const queuedJobs = await tx`
          SELECT *
          FROM job_queue
          WHERE status = 'queued'
            AND available_at <= NOW()
          ORDER BY created_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `;

        const job = queuedJobs[0];
        if (!job) {
          return null;
        }

        const updated = await tx`
          UPDATE job_queue
          SET
            status = 'processing',
            attempts = attempts + 1,
            locked_at = NOW(),
            locked_by = ${workerId},
            updated_at = NOW()
          WHERE id = ${job.id}
          RETURNING *
        `;

        return updated[0] ? this.rowToJob(updated[0]) : null;
      });
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to claim next job: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async complete(jobId: string): Promise<JobQueueItem | null> {
    try {
      const result = await sql`
        UPDATE job_queue
        SET
          status = 'completed',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = ${jobId}
        RETURNING *
      `;

      return result[0] ? this.rowToJob(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to complete job: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async fail(jobId: string, errorMessage: string): Promise<JobQueueItem | null> {
    try {
      const result = await sql`
        UPDATE job_queue
        SET
          last_error = ${errorMessage},
          status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
          available_at = CASE WHEN attempts >= max_attempts THEN available_at ELSE NOW() + INTERVAL '30 seconds' END,
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
        WHERE id = ${jobId}
        RETURNING *
      `;

      return result[0] ? this.rowToJob(result[0]) : null;
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fail job: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  async findByTransactionId(transactionId: string): Promise<JobQueueItem[]> {
    try {
      const results = await sql`
        SELECT * FROM job_queue
        WHERE transaction_id = ${transactionId}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToJob(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch job queue items: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  rowToJob(row: any): JobQueueItem {
    return {
      id: row.id,
      transaction_id: row.transaction_id,
      job_type: row.job_type,
      status: row.status,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
      available_at: new Date(row.available_at),
      locked_at: row.locked_at ? new Date(row.locked_at) : null,
      locked_by: row.locked_by,
      last_error: row.last_error,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};