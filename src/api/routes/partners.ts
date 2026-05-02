/**
 * Partner API Routes
 *
 * Endpoints for managing partner integrations (door-knocker workflow).
 */

import { Router, Request, Response } from "express";
import { CreatePartnerRequestSchema, UpdatePartnerRequestSchema } from "../../types";
import { partnerService } from "../../services/partner.service";
import { partnerRepository } from "../../db/repositories/partner.repository";
import { logger } from "../middleware/logger";

const router = Router();

/**
 * POST /api/partners
 * Onboard a new partner
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const validated = CreatePartnerRequestSchema.parse(req.body);
    const partner = await partnerService.onboardPartner(validated);

    logger.log("Partner onboarded", {
      partner_id: partner.id,
      partner_name: partner.name,
      status: partner.status,
    });

    res.status(201).json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        entity_type: partner.entity_type,
        status: partner.status,
        created_at: partner.created_at,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: (error as any).errors,
      });
    }

    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Failed to onboard partner", { error: message });

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/partners
 * List all partners with optional filtering
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;

    let partners;
    if (status) {
      partners = await partnerRepository.findByStatus(status as any);
    } else {
      partners = await partnerRepository.findAll();
    }

    res.json({
      success: true,
      partners: partners.map((p) => ({
        id: p.id,
        name: p.name,
        entity_type: p.entity_type,
        status: p.status,
        last_health_check_at: p.last_health_check_at,
        consecutive_failures: p.consecutive_failures,
        primary_contact_email: p.primary_contact_email,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Failed to fetch partners", { error: message });

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/partners/attention
 * Get partners requiring immediate attention
 */
router.get("/attention", async (req: Request, res: Response) => {
  try {
    const partners = await partnerService.getAttentionRequired();

    res.json({
      success: true,
      partners: partners.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        reason: [
          p.status === "suspended" && "Suspended",
          p.consecutive_failures >= 3 && `${p.consecutive_failures} consecutive failures`,
          p.last_health_check_at &&
            (Date.now() - p.last_health_check_at.getTime()) / (1000 * 60 * 60) > 24 &&
            "Health check needed",
        ]
          .filter(Boolean)
          .join(", "),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Failed to fetch partners needing attention", { error: message });

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * GET /api/partners/:id
 * Get partner details
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const partner = await partnerRepository.findById(req.params.id);

    if (!partner) {
      return res.status(404).json({
        success: false,
        error: "Partner not found",
      });
    }

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        entity_type: partner.entity_type,
        status: partner.status,
        api_version: partner.api_version,
        primary_contact_name: partner.primary_contact_name,
        primary_contact_email: partner.primary_contact_email,
        primary_contact_phone: partner.primary_contact_phone,
        rate_limit_per_minute: partner.rate_limit_per_minute,
        last_health_check_at: partner.last_health_check_at,
        last_successful_transaction_at: partner.last_successful_transaction_at,
        consecutive_failures: partner.consecutive_failures,
        status_page_url: partner.status_page_url,
        notes: partner.notes,
        created_at: partner.created_at,
        updated_at: partner.updated_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Failed to fetch partner", { error: message });

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * PATCH /api/partners/:id
 * Update partner details
 */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const validated = UpdatePartnerRequestSchema.parse(req.body);
    const partner = await partnerRepository.update(req.params.id, validated);

    logger.log("Partner updated", {
      partner_id: partner.id,
      partner_name: partner.name,
    });

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
        updated_at: partner.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: (error as any).errors,
      });
    }

    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Failed to update partner", { error: message });

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/partners/:id/status/:status
 * Transition partner status
 */
router.post("/:id/status/:status", async (req: Request, res: Response) => {
  try {
    const partner = await partnerService.transitionStatus(
      req.params.id,
      req.params.status as any
    );

    logger.log("Partner status transitioned", {
      partner_id: partner.id,
      new_status: partner.status,
    });

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const statusCode =
      message.includes("not found") || message.includes("Cannot transition") ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/partners/:id/activate
 * Activate partner for live use (testing → live)
 */
router.post("/:id/activate", async (req: Request, res: Response) => {
  try {
    const partner = await partnerService.activatePartner(req.params.id);

    logger.log("Partner activated", {
      partner_id: partner.id,
      partner_name: partner.name,
    });

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/partners/:id/suspend
 * Suspend partner temporarily
 */
router.post("/:id/suspend", async (req: Request, res: Response) => {
  try {
    const partner = await partnerService.suspendPartner(
      req.params.id,
      req.body.reason
    );

    logger.log("Partner suspended", {
      partner_id: partner.id,
      partner_name: partner.name,
      reason: req.body.reason,
    });

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/partners/:id/resume
 * Resume suspended partner
 */
router.post("/:id/resume", async (req: Request, res: Response) => {
  try {
    const partner = await partnerService.resumePartner(req.params.id);

    logger.log("Partner resumed", {
      partner_id: partner.id,
      partner_name: partner.name,
    });

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/partners/:id/health-check
 * Perform health check on partner API
 */
router.post("/:id/health-check", async (req: Request, res: Response) => {
  try {
    const result = await partnerService.performHealthCheck(req.params.id);

    logger.log("Partner health check performed", {
      partner_id: result.partner.id,
      partner_name: result.partner.name,
      healthy: result.healthy,
    });

    res.json({
      success: true,
      healthy: result.healthy,
      error: result.error,
      partner: {
        id: result.partner.id,
        name: result.partner.name,
        consecutive_failures: result.partner.consecutive_failures,
        last_health_check_at: result.partner.last_health_check_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * POST /api/partners/:id/contact
 * Update partner contact information
 */
router.post("/:id/contact", async (req: Request, res: Response) => {
  try {
    const partner = await partnerService.updateContact(req.params.id, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
    });

    logger.log("Partner contact updated", {
      partner_id: partner.id,
      partner_name: partner.name,
    });

    res.json({
      success: true,
      partner: {
        id: partner.id,
        name: partner.name,
        primary_contact_name: partner.primary_contact_name,
        primary_contact_email: partner.primary_contact_email,
        primary_contact_phone: partner.primary_contact_phone,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    res.status(400).json({
      success: false,
      error: message,
    });
  }
});

/**
 * DELETE /api/partners/:id
 * Delete/offboard partner
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await partnerRepository.delete(req.params.id);

    logger.log("Partner deleted", { partner_id: req.params.id });

    res.json({
      success: true,
      message: "Partner deleted",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logger.error("Failed to delete partner", { error: message });

    res.status(500).json({
      success: false,
      error: message,
    });
  }
});
export const partnerRoutes = router;
