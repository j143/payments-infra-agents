/**
 * Database Connection & Query Builder
 * 
 * Centralizes all database access with clear query patterns.
 * AI agents should use these utilities instead of raw SQL.
 */

import postgres from "postgres";
import { config } from "dotenv";

config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL environment variable is required");
}

export const sql = postgres(databaseUrl);

/**
 * Database utilities for common patterns
 */
export const db = {
  /**
   * Execute a query and return single row
   */
  async queryOne<T>(
    query: ReturnType<typeof sql>,
    errorMessage?: string
  ): Promise<T | null> {
    try {
      const result = await query;
      return result[0] || null;
    } catch (error) {
      console.error("Database query error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Execute a query and return all rows
   */
  async queryMany<T>(
    query: ReturnType<typeof sql>,
    errorMessage?: string
  ): Promise<T[]> {
    try {
      return await query;
    } catch (error) {
      console.error("Database query error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Execute an insert and return the inserted row
   */
  async insert<T>(
    query: ReturnType<typeof sql>,
    errorMessage?: string
  ): Promise<T> {
    try {
      const result = await query;
      if (!result[0]) {
        throw new Error("Insert returned no rows");
      }
      return result[0];
    } catch (error) {
      console.error("Database insert error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Execute an update and return the number of affected rows
   */
  async update(
    query: ReturnType<typeof sql>,
    errorMessage?: string
  ): Promise<number> {
    try {
      const result = await query;
      return result.count;
    } catch (error) {
      console.error("Database update error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Execute a delete and return the number of affected rows
   */
  async delete(
    query: ReturnType<typeof sql>,
    errorMessage?: string
  ): Promise<number> {
    try {
      const result = await query;
      return result.count;
    } catch (error) {
      console.error("Database delete error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Acquire a transaction for multi-statement operations
   */
  async transaction<T>(
    callback: (tx: typeof sql) => Promise<T>
  ): Promise<T> {
    return sql.begin(callback);
  },
};

export type Database = typeof sql;
