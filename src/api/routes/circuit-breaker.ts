/**
 * Circuit Breaker Routes
 * 
 * API endpoints for managing circuit breaker events.
 */

import { Router, Request, Response, NextFunction } from "express";
import { circuitBreakerService } from "../../services/circuit-breaker.service";

const router = Router();

/**
 * GET /api/circuit-breaker/status/:vendor_id
 * Check if vendor can process transactions
 */
router.get(
  "/circuit-breaker/status/:vendor_id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const canProceed = await circuitBreakerService.canProceed(
        req.params.vendor_id
      );

      res.status(200).json({
        success: true,
        data: {
          vendor_id: req.params.vendor_id,
          can_proceed: canProceed,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/circuit-breaker/resolve/:vendor_id
 * Manually resolve a circuit breaker breach
 */
router.post(
  "/circuit-breaker/resolve/:vendor_id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await circuitBreakerService.resolve(req.params.vendor_id);

      res.status(200).json({
        success: true,
        message: `Circuit breaker resolved for vendor ${req.params.vendor_id}`,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const circuitBreakerRoutes = router;
