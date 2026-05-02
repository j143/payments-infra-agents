/**
 * Audit Trail & Compliance Evidence Routes
 *
 * Provides endpoints for compliance teams, auditors, and operations to query
 * the full evidence trail from payment intent submission through settlement.
 */

import { Router, Request, Response, NextFunction } from "express";
import { ApplicationError, ErrorCode } from "../../types";
import { auditTrailService } from "../../services/audit-trail.service";

const router = Router();

/**
 * GET /api/audit-trail/payment-intent/:payment_intent_id
 * Query the complete audit trail for a payment intent
 */
router.get(
  "/payment-intent/:payment_intent_id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { payment_intent_id } = req.params;

      const evidence = await auditTrailService.getPaymentIntentEvidence(
        payment_intent_id
      );

      if (!evidence) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          "Payment intent not found",
          404
        );
      }

      res.status(200).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/audit-trail/correlation/:correlation_id
 * Query the complete audit trail by correlation ID (groups related requests)
 */
router.get(
  "/correlation/:correlation_id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { correlation_id } = req.params;

      const evidence = await auditTrailService.getCorrelationEvidence(
        correlation_id
      );

      if (evidence.length === 0) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          "No payment intents found for this correlation ID",
          404
        );
      }

      res.status(200).json({
        success: true,
        data: evidence,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/audit-trail/compliance-report
 * Generate a compliance report for audit/regulatory review
 */
router.get(
  "/compliance-report",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { start_date, end_date } = req.query;

      const report = await auditTrailService.generateComplianceReport({
        startDate: start_date ? new Date(start_date as string) : undefined,
        endDate: end_date ? new Date(end_date as string) : undefined,
      });

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const auditTrailRoutes = router;
