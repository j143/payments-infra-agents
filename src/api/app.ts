/**
 * Main Application Entry Point
 * 
 * Sets up the Express server with all middleware and routes.
 */

import express, { Application } from "express";
import { transactionRoutes } from "./routes/transactions";
import { circuitBreakerRoutes } from "./routes/circuit-breaker";
import { verificationTaskRoutes } from "./routes/verification-tasks";
import { partnerRoutes } from "./routes/partners";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/request-logger";

const app: Application = express();

// Middleware
app.use(express.json());
app.use(requestLogger);

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Routes
app.use("/api", transactionRoutes);
app.use("/api", circuitBreakerRoutes);
app.use("/api", verificationTaskRoutes);
app.use("/api/partners", partnerRoutes);

// Error handling (must be last)
app.use(errorHandler);

export default app;
