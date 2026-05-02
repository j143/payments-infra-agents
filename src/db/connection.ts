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
    query: Promise<T[]>,
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
    query: Promise<T[]>,
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
    query: Promise<T[]>,
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
  async update(query: Promise<any>, errorMessage?: string): Promise<number> {
    try {
      const result = await query;
      return result.count || 0;
    } catch (error) {
      console.error("Database update error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Execute a delete and return the number of affected rows
   */
  async delete(query: Promise<any>, errorMessage?: string): Promise<number> {
    try {
      const result = await query;
      return result.count || 0;
    } catch (error) {
      console.error("Database delete error:", errorMessage || error);
      throw error;
    }
  },

  /**
   * Acquire a transaction for multi-statement operations
   */
  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return (await sql.begin(callback as never)) as T;
  },
};

export type Database = typeof sql;
