/**
 * Stripe Webhook Receiver
 *
 * Uses express.raw to obtain the unparsed body required for signature verification.
 */

import express, { Request, Response, NextFunction } from "express";
import Stripe from "stripe";
import * as stripeAdapter from "../../../services/psp/stripe.adapter";

const router = express.Router();

// Use express.raw in the route registration (see app.ts) or here; we assume
// the app mounts this router with raw body parsing.

router.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const sig = (req.headers["stripe-signature"] as string) || "";
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        return res.status(500).json({ error: "Stripe webhook secret not configured" });
      }

      const rawBody = (req as any).rawBody || req.body;
      let event: Stripe.Event;

      try {
        const stripe = new Stripe(process.env.STRIPE_API_KEY || "", {
          apiVersion: "2022-11-15",
        });
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err) {
        return res.status(400).json({ error: "Invalid webhook signature" });
      }

      // Persist raw event to shadow log / audit trail in future

      await stripeAdapter.handleWebhookEvent(event);

      res.status(200).json({ received: true });
    } catch (error) {
      next(error);
    }
  }
);

export const stripeWebhookRoutes = router;
