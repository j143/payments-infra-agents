/**
 * Verification Task Service
 * 
 * Business logic for manual reconciliation workflow.
 */

import { verificationTaskRepository } from "../db/repositories/verification-task.repository";
import {
  VerificationTask,
  DiscrepancyType,
  ApplicationError,
  ErrorCode,
} from "../types";

export const verificationTaskService = {
  /**
   * Get a verification task by ID
   */
  async getTask(taskId: string): Promise<VerificationTask> {
    const task = await verificationTaskRepository.findById(taskId);
    if (!task) {
      throw new ApplicationError(
        ErrorCode.VERIFICATION_TASK_NOT_FOUND,
        `Verification task ${taskId} not found`,
        404
      );
    }
    return task;
  },

  /**
   * Get all pending verification tasks
   */
  async getPendingTasks(): Promise<VerificationTask[]> {
    return verificationTaskRepository.findPending();
  },

  /**
   * Assign a task to a user for review
   */
  async assignTask(taskId: string, userId: string): Promise<VerificationTask> {
    const task = await this.getTask(taskId);

    if (task.status === "verified" || task.status === "discrepancy_found") {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Cannot assign task in status ${task.status}`,
        400
      );
    }

    const updated = await verificationTaskRepository.assignToUser(taskId, userId);
    if (!updated) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        "Failed to assign task",
        500
      );
    }

    return updated;
  },

  /**
   * Mark task as verified (no discrepancy found)
   */
  async markVerified(taskId: string, notes?: string): Promise<VerificationTask> {
    const task = await this.getTask(taskId);

    if (task.status === "verified" || task.status === "discrepancy_found") {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Task already in status ${task.status}`,
        400
      );
    }

    const updated = await verificationTaskRepository.markVerified(taskId, notes);
    if (!updated) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        "Failed to mark task verified",
        500
      );
    }

    return updated;
  },

  /**
   * Mark task as having a discrepancy
   */
  async markDiscrepancy(
    taskId: string,
    discrepancyType: DiscrepancyType,
    notes?: string
  ): Promise<VerificationTask> {
    const task = await this.getTask(taskId);

    if (task.status === "verified" || task.status === "discrepancy_found") {
      throw new ApplicationError(
        ErrorCode.INVALID_INPUT,
        `Task already in status ${task.status}`,
        400
      );
    }

    const updated = await verificationTaskRepository.markDiscrepancy(
      taskId,
      discrepancyType,
      notes
    );

    if (!updated) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        "Failed to mark discrepancy",
        500
      );
    }

    return updated;
  },

  /**
   * Get all zombie transactions (money left bank but didn't update app)
   */
  async getZombieTransactions(): Promise<VerificationTask[]> {
    return verificationTaskRepository.findZombieTransactions();
  },
};
