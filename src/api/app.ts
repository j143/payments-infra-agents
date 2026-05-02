/**
 * Main Application Entry Point
 * 
 * Sets up the Express server with all middleware and routes.
 */

import express, { Application } from "express";
import { transactionRoutes } from "./routes/transactions";
import { paymentIntentRoutes } from "./routes/payment-intents";
import { circuitBreakerRoutes } from "./routes/circuit-breaker";
import { verificationTaskRoutes } from "./routes/verification-tasks";
import { partnerRoutes } from "./routes/partners";
import { auditTrailRoutes } from "./routes/audit-trail";
import { stripeWebhookRoutes } from "./routes/webhooks/stripe";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";

const app: Application = express();

// Middleware
// Use json for most routes, but we need raw body for Stripe webhooks.
app.use((req, res, next) => {
  // capture raw body for webhook verification
  let data = Buffer.from([]);
  req.on("data", (chunk: Buffer) => {
    data = Buffer.concat([data, chunk]);
  });
  req.on("end", () => {
    // attach rawBody if content-type is json (Stripe signs the raw payload)
    (req as any).rawBody = data.length ? data.toString() : undefined;
    next();
  });
});
app.use(express.json());
app.use(requestLogger);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Routes
app.use("/api", transactionRoutes);
app.use("/api/payment-intents", paymentIntentRoutes);
app.use("/api", circuitBreakerRoutes);
app.use("/api", verificationTaskRoutes);
app.use("/api/partners", partnerRoutes);
app.use("/api/audit-trail", auditTrailRoutes);
// Webhooks: mount Stripe webhook receiver at a dedicated path
app.use("/api/webhooks/stripe", stripeWebhookRoutes);

// Error handling (must be last)
app.use(errorHandler);

export default app;
