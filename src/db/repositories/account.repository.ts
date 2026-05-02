/**
 * Account Repository
 * 
 * Manages merchant/business accounts.
 */

import { sql } from "../connection";
import { Account, ApplicationError, ErrorCode } from "../../types";

export const accountRepository = {
  /**
   * Create a new account
   */
  async create(
    merchantId: string,
    accountType: "business" | "escrow" | "settlement",
    initialBalanceCents: number = 0
  ): Promise<Account> {
    try {
      const result = await sql`
        INSERT INTO accounts (
          merchant_id,
          account_type,
          balance_cents
        ) VALUES (
          ${merchantId},
          ${accountType},
          ${initialBalanceCents}
        )
        RETURNING *
      `;

      if (!result[0]) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to create account",
          500
        );
      }

      return this.rowToAccount(result[0]);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to create account: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get account by ID
   */
  async findById(id: string): Promise<Account | null> {
    try {
      const result = await sql`
        SELECT * FROM accounts WHERE id = ${id}
      `;

      if (!result[0]) return null;
      return this.rowToAccount(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch account: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Get all accounts for a merchant
   */
  async findByMerchantId(merchantId: string): Promise<Account[]> {
    try {
      const results = await sql`
        SELECT * FROM accounts 
        WHERE merchant_id = ${merchantId}
        ORDER BY created_at DESC
      `;

      return results.map((row) => this.rowToAccount(row));
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to fetch accounts: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Update account balance
   */
  async updateBalance(id: string, balanceCents: number): Promise<Account | null> {
    try {
      const result = await sql`
        UPDATE accounts 
        SET balance_cents = ${balanceCents},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      if (!result[0]) return null;
      return this.rowToAccount(result[0]);
    } catch (error) {
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to update account balance: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Deduct from account balance (with validation)
   */
  async deductBalance(id: string, amountCents: number): Promise<Account> {
    try {
      const account = await this.findById(id);
      if (!account) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          `Account ${id} not found`,
          404
        );
      }

      if (account.balance_cents < amountCents) {
        throw new ApplicationError(
          ErrorCode.INSUFFICIENT_FUNDS,
          `Insufficient funds. Balance: ${account.balance_cents}, Required: ${amountCents}`,
          400
        );
      }

      const updated = await this.updateBalance(
        id,
        account.balance_cents - amountCents
      );

      if (!updated) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to deduct balance",
          500
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to deduct balance: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Add to account balance
   */
  async addBalance(id: string, amountCents: number): Promise<Account> {
    try {
      const account = await this.findById(id);
      if (!account) {
        throw new ApplicationError(
          ErrorCode.INVALID_INPUT,
          `Account ${id} not found`,
          404
        );
      }

      const updated = await this.updateBalance(
        id,
        account.balance_cents + amountCents
      );

      if (!updated) {
        throw new ApplicationError(
          ErrorCode.DATABASE_ERROR,
          "Failed to add balance",
          500
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError(
        ErrorCode.DATABASE_ERROR,
        `Failed to add balance: ${error instanceof Error ? error.message : "unknown error"}`,
        500
      );
    }
  },

  /**
   * Helper to convert database row to Account type
   */
  private rowToAccount(row: any): Account {
    return {
      id: row.id,
      merchant_id: row.merchant_id,
      account_type: row.account_type,
      balance_cents: row.balance_cents,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  },
};
