/**
 * Verification Task Routes
 * 
 * API endpoints for managing manual reconciliation tasks.
 */

import { Router, Request, Response, NextFunction } from "express";
import { verificationTaskService } from "../../services/verification-task.service";
import { ApplicationError, ErrorCode } from "../../types";

const router = Router();

/**
 * GET /api/verification-tasks
 * Get all pending verification tasks
 */
router.get(
  "/verification-tasks",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tasks = await verificationTaskService.getPendingTasks();

      res.status(200).json({
        success: true,
        data: tasks,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/verification-tasks/:id
 * Get verification task by ID
 */
router.get(
  "/verification-tasks/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await verificationTaskService.getTask(req.params.id);

      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/verification-tasks/:id/assign
 * Assign task to a user
 */
router.post(
  "/verification-tasks/:id/assign",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.body.user_id;
      if (!userId) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          "user_id is required",
          400
        );
      }

      const task = await verificationTaskService.assignTask(
        req.params.id,
        userId
      );

      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/verification-tasks/:id/mark-verified
 * Mark task as verified (no discrepancy found)
 */
router.post(
  "/verification-tasks/:id/mark-verified",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task = await verificationTaskService.markVerified(
        req.params.id,
        req.body.notes
      );

      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/verification-tasks/:id/mark-discrepancy
 * Mark task as discrepancy found
 */
router.post(
  "/verification-tasks/:id/mark-discrepancy",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const discrepancyType = req.body.discrepancy_type;
      if (!discrepancyType) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          "discrepancy_type is required",
          400
        );
      }

      const task = await verificationTaskService.markDiscrepancy(
        req.params.id,
        discrepancyType,
        req.body.notes
      );

      res.status(200).json({
        success: true,
        data: task,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const verificationTaskRoutes = router;
