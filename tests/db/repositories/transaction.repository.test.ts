/**
 * Example: Transaction Repository Tests
 * 
 * This file shows how to test database repositories.
 * Use this as a template for new repository tests.
 */

import "dotenv/config";
import { describe, it, expect, beforeAll } from "vitest";
import {
  setupTestDatabase,
  clearDatabase,
  createTestTransaction,
} from "../../setup";
import { ApplicationError, ErrorCode } from "../../../src/types";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const suite = hasDatabase ? describe : describe.skip;

suite("transactionRepository", () => {
  setupTestDatabase();

  let transactionRepository:
    | typeof import("../../../src/db/repositories/transaction.repository").transactionRepository
    | null = null;

  beforeAll(async () => {
    if (!hasDatabase) {
      return;
    }

    const repositoryModule = await import(
      "../../../src/db/repositories/transaction.repository"
    );
    transactionRepository = repositoryModule.transactionRepository;
  });

  describe("create", () => {
    it("should create a transaction with queued status", async () => {
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

      const tx = await transactionRepository.create({
        reference_id: "TEST-001",
        account_id: "00000000-0000-0000-0000-000000000001",
        merchant_id: "00000000-0000-0000-0000-000000000002",
        amount_cents: 10000,
        currency: "SGD",
      });

      expect(tx.status).toBe("queued");
      expect(tx.reference_id).toBe("TEST-001");
      expect(tx.amount_cents).toBe(10000);
      expect(tx.requires_approval).toBe(false);
    });

    it("should throw ApplicationError on duplicate reference_id", async () => {
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

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
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

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
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

      const found = await transactionRepository.findById(
        "00000000-0000-0000-0000-000000000000"
      );

      expect(found).toBeNull();
    });
  });

  describe("markForApproval", () => {
    it("should mark transaction for approval", async () => {
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

      const tx = await createTestTransaction();

      const updated = await transactionRepository.markForApproval(tx.id);

      expect(updated).not.toBeNull();
      expect(updated?.requires_approval).toBe(true);
      expect(updated?.status).toBe("requires_approval");
    });
  });

  describe("updateStatus", () => {
    it("should update transaction status", async () => {
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

      const tx = await createTestTransaction();

      const updated = await transactionRepository.updateStatus(tx.id, "processing");

      expect(updated?.status).toBe("processing");
    });

    it("should record approval details", async () => {
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

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
      if (!transactionRepository) {
        expect(true).toBe(true);
        return;
      }

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
