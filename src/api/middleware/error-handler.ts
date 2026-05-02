/**
 * Error Handling Middleware
 * 
 * Centralized error handling for all API routes.
 * AI agents: If you encounter an error, throw an ApplicationError with the appropriate ErrorCode.
 */

import { Request, Response, NextFunction } from "express";
import { ApplicationError, ErrorCode } from "../../types";
import { logger } from "./logger";

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Handle Zod validation errors
  if (error instanceof Error && error.message.includes("Zod validation")) {
    logger.warn("Validation error", { error });
    return res.status(400).json({
      success: false,
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: error.message,
      },
    });
  }

  // Handle application errors
  if (error instanceof ApplicationError) {
    logger.warn("Application error", {
      code: error.code,
      statusCode: error.statusCode,
      message: error.message,
      details: error.details,
    });

    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    });
  }

  // Handle unknown errors
  logger.error("Unexpected error", { error });

  res.status(500).json({
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
    },
  });
};
