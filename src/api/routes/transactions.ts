/**
 * Transaction Routes
 * 
 * API endpoints for transaction operations.
 * All endpoints are designed to be clear and consistent.
 */

import { Router, Request, Response, NextFunction } from "express";
import { transactionService } from "../../services/transaction.service";
import {
  CreateTransactionRequestSchema,
  ApplicationError,
  ErrorCode,
} from "../../types";

const router = Router();

/**
 * POST /api/transactions
 * Create a new transaction
 */
router.post(
  "/transactions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = CreateTransactionRequestSchema.parse(req.body);
      const transaction =
        await transactionService.createTransaction(validated);

      res.status(202).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/transactions/:id
 * Get transaction by ID with full audit trail
 */
router.get(
  "/transactions/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await transactionService.getTransactionWithAudit(
        req.params.id
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/transactions
 * Get all pending approvals
 */
router.get(
  "/transactions",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const transactions = await transactionService.getPendingApprovals();

      res.status(200).json({
        success: true,
        data: transactions,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/transactions/:id/approve
 * Approve a transaction
 */
router.post(
  "/transactions/:id/approve",
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

      const transaction = await transactionService.approveTransaction(
        req.params.id,
        userId
      );

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/transactions/:id/reject
 * Reject a transaction
 */
router.post(
  "/transactions/:id/reject",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reason = req.body.reason;
      if (!reason) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          "reason is required",
          400
        );
      }

      const transaction = await transactionService.rejectTransaction(
        req.params.id,
        reason
      );

      res.status(200).json({
        success: true,
        data: transaction,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const transactionRoutes = router;
