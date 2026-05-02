/**
 * Agentic Payment Intent Routes
 *
 * A2A-style ingress for agent-originated payment requests.
 */

import { Router, Request, Response, NextFunction } from "express";
import {
  submitAgentPaymentIntent,
  validateCreatePaymentIntentRequest,
} from "../../services/agentic-payment.service";

const router = Router();

/**
 * POST /api/payment-intents
 * Create a payment intent from an agent-originated request.
 */
router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = validateCreatePaymentIntentRequest(req.body);
      const result = await submitAgentPaymentIntent(validated);

      res.status(202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

export const paymentIntentRoutes = router;
