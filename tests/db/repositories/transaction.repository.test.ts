/**
 * Example: Transaction Repository Tests
 * 
 * This file shows how to test database repositories.
 * Use this as a template for new repository tests.
 */

import { describe, it, expect } from "vitest";
import {
  setupTestDatabase,
  clearDatabase,
  createTestTransaction,
} from "./setup";
import { transactionRepository } from "../src/db/repositories/transaction.repository";
import { ApplicationError, ErrorCode } from "../src/types";

describe("transactionRepository", () => {
  setupTestDatabase();

  describe("create", () => {
    it("should create a transaction with pending status", async () => {
      const tx = await transactionRepository.create({
        reference_id: "TEST-001",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 10000,
        currency: "SGD",
      });

      expect(tx.status).toBe("pending");
      expect(tx.reference_id).toBe("TEST-001");
      expect(tx.amount_cents).toBe(10000);
      expect(tx.requires_approval).toBe(false);
    });

    it("should throw ApplicationError on duplicate reference_id", async () => {
      await transactionRepository.create({
        reference_id: "DUPLICATE",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 10000,
        currency: "SGD",
      });

      try {
        await transactionRepository.create({
          reference_id: "DUPLICATE",
          account_id: "00000000-0000-0000-0000-000000000001",
          merchant_id: "00000000-0000-0000-0000-000000000002",
          amount_cents: 20000,
          currency: "SGD",
        });
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ApplicationError);
        const appError = error as ApplicationError;
        expect(appError.code).toBe(ErrorCode.DUPLICATE_TRANSACTION);
      }
    });
  });

  describe("findById", () => {
    it("should return transaction by id", async () => {
      const created = await transactionRepository.create({
        reference_id: "TEST-002",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 10000,
        currency: "SGD",
      });

      const found = await transactionRepository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.reference_id).toBe("TEST-002");
    });

    it("should return null for non-existent transaction", async () => {
      const found = await transactionRepository.findById(
        "00000000-0000-0000-0000-000000000000"
      );

      expect(found).toBeNull();
    });
  });

  describe("markForApproval", () => {
    it("should mark transaction for approval", async () => {
      const tx = await createTestTransaction();

      const updated = await transactionRepository.markForApproval(tx.id);

      expect(updated).not.toBeNull();
      expect(updated?.requires_approval).toBe(true);
      expect(updated?.status).toBe("requires_approval");
    });
  });

  describe("updateStatus", () => {
    it("should update transaction status", async () => {
      const tx = await createTestTransaction();

      const updated = await transactionRepository.updateStatus(tx.id, "processing");

      expect(updated?.status).toBe("processing");
    });

    it("should record approval details", async () => {
      const tx = await createTestTransaction();
      const userId = "00000000-0000-0000-0000-000000000099";
      const now = new Date();

      const updated = await transactionRepository.updateStatus(
        tx.id,
        "approved",
        {
          approved_by_user_id: userId,
          approval_timestamp: now,
        }
      );

      expect(updated?.status).toBe("approved");
      expect(updated?.approved_by_user_id).toBe(userId);
      expect(updated?.approval_timestamp).not.toBeNull();
    });
  });

  describe("findPendingApproval", () => {
    it("should return transactions requiring approval", async () => {
      // Create a transaction under threshold (should not require approval)
      await transactionRepository.create({
        reference_id: "UNDER",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 10000,
        currency: "SGD",
      });

      // Create a transaction and mark for approval
      const tx = await transactionRepository.create({
        reference_id: "NEEDS-APPROVAL",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 60000,
        currency: "SGD",
      });
      await transactionRepository.markForApproval(tx.id);

      const pending = await transactionRepository.findPendingApproval();

      expect(pending).toHaveLength(1);
      expect(pending[0].requires_approval).toBe(true);
    });
  });
});
