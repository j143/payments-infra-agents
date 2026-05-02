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

    // Import and run schema
    const { schema } = await import("./001_initial_schema.js");
    await sql.unsafe(schema);

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
