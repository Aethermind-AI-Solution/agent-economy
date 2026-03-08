/**
 * Run migration 002 against Supabase via Management API.
 */

const fs = require("fs");

const PROJECT_REF = "seijwuruihhhiueknmhm";
const SERVICE_KEY = "sb_secret_uknbkxyLb3_ayqXLLz_R4A_Sa617rXe";

async function main() {
  const sql = fs.readFileSync(
    "supabase/migrations/002_atomic_escrow_and_auth.sql",
    "utf8"
  );

  console.log("Running migration 002 via Management API...\n");

  const resp = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (resp.ok) {
    const result = await resp.json();
    console.log("Migration succeeded.");
    console.log(JSON.stringify(result, null, 2).substring(0, 500));
  } else {
    const text = await resp.text();
    console.log("Management API returned:", resp.status);
    console.log(text.substring(0, 300));
    console.log("\n========================================");
    console.log("MANUAL STEP REQUIRED");
    console.log("========================================");
    console.log("Run this SQL in the Supabase SQL Editor:");
    console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/sql`);
    console.log("  File: supabase/migrations/002_atomic_escrow_and_auth.sql");
    console.log("========================================\n");
  }
}

main().catch(console.error);
