import { describe, expect, it } from "vitest";
import {
  buildSettlementOutcome,
  mapTransactionStatusToSettlementLifecycle,
} from "../../src/services/settlement.service";

describe("settlement.service", () => {
  const transaction = {
    id: "00000000-0000-0000-0000-000000000777",
    reference_id: "ORDER-SETTLEMENT-001",
    account_id: "00000000-0000-0000-0000-000000000001",
    merchant_id: "00000000-0000-0000-0000-000000000002",
    amount_cents: 2500,
    currency: "SGD",
    status: "completed" as const,
    requires_approval: false,
    approved_by_user_id: null,
    approval_timestamp: null,
    rejection_reason: null,
    failure_reason: null,
    created_at: new Date("2026-05-02T10:00:00Z"),
    updated_at: new Date("2026-05-02T10:00:00Z"),
  };

  it("maps transaction lifecycle states to settlement lifecycle stages", () => {
    expect(mapTransactionStatusToSettlementLifecycle("queued")).toBe(
      "initiated"
    );
    expect(mapTransactionStatusToSettlementLifecycle("processing")).toBe(
      "submitted"
    );
    expect(mapTransactionStatusToSettlementLifecycle("completed")).toBe(
      "settled"
    );
    expect(mapTransactionStatusToSettlementLifecycle("failed")).toBe(
      "failed"
    );
  });

  it("builds a canonical settlement outcome from a successful partner response", () => {
    const occurredAt = new Date("2026-05-02T10:05:00Z");
    const outcome = buildSettlementOutcome(transaction, {
      partnerName: "mock-partner",
      partnerEndpoint: "/payments",
      partnerResponse: {
        status: 200,
        payload: {
          settlement_id: "SETTLE-001",
          accepted: true,
        },
      },
      transactionStatus: "completed",
      occurredAt,
    });

    expect(outcome).toMatchObject({
      transaction_id: transaction.id,
      transaction_status: "completed",
      lifecycle_stage: "settled",
      partner_name: "mock-partner",
      partner_endpoint: "/payments",
      partner_response_status_code: 200,
      settlement_reference_id: "SETTLE-001",
      failure_reason: null,
      occurred_at: occurredAt,
      created_at: occurredAt,
      updated_at: occurredAt,
    });
  });

  it("builds a failed settlement outcome when the transaction fails", () => {
    const occurredAt = new Date("2026-05-02T10:05:00Z");
    const outcome = buildSettlementOutcome(
      {
        ...transaction,
        status: "failed",
      },
      {
        partnerName: "mock-partner",
        partnerEndpoint: "/payments",
        transactionStatus: "failed",
        failureReason: "Partner timeout",
        occurredAt,
      }
    );

    expect(outcome).toMatchObject({
      lifecycle_stage: "failed",
      partner_response_status_code: null,
      settlement_reference_id: null,
      failure_reason: "Partner timeout",
    });
  });
});