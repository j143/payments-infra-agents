/**
 * Partner API Adapter
 * 
 * Handles all communication with partner APIs.
 * Each call logs to shadow_logs BEFORE processing.
 * This is our "Black Box" for dispute resolution.
 */

import { shadowLogRepository } from "../db/repositories/shadow-log.repository";
import { ApplicationError, ErrorCode } from "../types";

export interface PartnerAPICallOptions {
  transactionId: string;
  partnerName: string;
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  requestPayload: Record<string, unknown>;
  timeout?: number;
}

export interface PartnerAPIResponse {
  status: number;
  payload: Record<string, unknown>;
}

export const partnerApiAdapter = {
  /**
   * Make a partner API call with shadow logging
   * 
   * IMPORTANT: Logs BEFORE processing to ensure we have a record
   * even if the response handling fails.
   */
  async call(options: PartnerAPICallOptions): Promise<PartnerAPIResponse> {
    const partnerKey = process.env.PARTNER_API_KEY;
    const partnerUrl = process.env.PARTNER_API_URL;

    if (!partnerKey || !partnerUrl) {
      throw new ApplicationError(
        ErrorCode.INTERNAL_ERROR,
        "Partner API credentials not configured",
        500
      );
    }

    // Step 1: Log request to shadow_logs FIRST
    const shadowLog = await shadowLogRepository.create({
      transaction_id: options.transactionId,
      partner_name: options.partnerName,
      endpoint: options.endpoint,
      http_method: options.method,
      request_payload: options.requestPayload,
    });

    try {
      // Step 2: Make the actual API call
      const response = await fetch(
        `${partnerUrl}${options.endpoint}`,
        {
          method: options.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${partnerKey}`,
          },
          body:
            options.method !== "GET"
              ? JSON.stringify(options.requestPayload)
              : undefined,
          signal: AbortSignal.timeout(options.timeout || 30000),
        }
      );

      const responsePayload = await response.json();

      // Step 3: Log response to shadow_logs
      await shadowLogRepository.updateWithResponse(shadowLog.id, {
        response_payload: responsePayload,
        response_status_code: response.status,
      });

      // Step 4: Handle errors
      if (!response.ok) {
        throw new ApplicationError(
          ErrorCode.PARTNER_API_ERROR,
          `Partner API returned ${response.status}: ${JSON.stringify(responsePayload)}`,
          response.status
        );
      }

      return {
        status: response.status,
        payload: responsePayload,
      };
    } catch (error) {
      // Log error to shadow_logs
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        errorMessage = error.message;
      }

      await shadowLogRepository.updateWithResponse(shadowLog.id, {
        response_payload: {},
        response_status_code: 0,
        error_message: errorMessage,
      });

      // Handle different error types
      if (error instanceof ApplicationError) {
        throw error;
      }

      if (error instanceof TypeError && error.message.includes("timeout")) {
        throw new ApplicationError(
          ErrorCode.PARTNER_API_TIMEOUT,
          `Partner API call timed out after ${options.timeout || 30000}ms`,
          504
        );
      }

      throw new ApplicationError(
        ErrorCode.PARTNER_API_ERROR,
        `Partner API call failed: ${errorMessage}`,
        500
      );
    }
  },
};
