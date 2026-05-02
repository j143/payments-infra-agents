/**
 * Main Server Entry Point
 */

import "dotenv/config";
import app from "./api/app";
import { logger } from "./api/middleware/logger";

const PORT = process.env.API_PORT || 3000;

const server = app.listen(PORT, () => {
  logger.log(`🚀 Server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.log("SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.log("Server closed");
    process.exit(0);
  });
});
