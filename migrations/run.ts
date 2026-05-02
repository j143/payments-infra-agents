import postgres from "postgres";
import { config } from "dotenv";

config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const sql = postgres(databaseUrl);

async function runMigrations() {
  try {
    console.log("🔄 Running migrations...");

    // Import and run schemas in order
    const migrations = [
      await import("./001_initial_schema.ts"),
      await import("./002_job_queue.ts"),
      await import("./003_partners.ts"),
      await import("./004_delegation_grants.ts"),
    ];

    for (const migration of migrations) {
      await sql.unsafe(migration.schema);
    }

    console.log("✅ Migrations completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigrations();
