/**
 * Request Logging Middleware
 * 
 * Logs all incoming requests for debugging and audit trails.
 */

import { Request, Response, NextFunction } from "express";
import { logger } from "./logger";

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();

  // Log the incoming request
  logger.log("Incoming request", {
    method: req.method,
    path: req.path,
    query: req.query,
  });

  // Capture the response
  const originalJson = res.json;
  res.json = function (data: unknown) {
    const duration = Date.now() - startTime;
    logger.log("Response sent", {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration_ms: duration,
    });

    return originalJson.call(this, data);
  };

  next();
};
