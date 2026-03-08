/**
 * Seed Script — Run once after migration to create demo agents.
 *
 * Usage: npx tsx scripts/seed.ts
 *
 * Creates:
 *   ProcureBot (buyer) — $50 balance
 *   PixelForge (vendor) — $0 balance, image_generation capability
 */

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const AGENTS = [
  {
    name: "ProcureBot",
    type: "buyer",
    rawKey: "pk_buyer_procurebot_demo_key_001",
    balance: 50.0,
    capabilities: [],
  },
  {
    name: "PixelForge",
    type: "vendor",
    rawKey: "pk_vendor_pixelforge_demo_key_001",
    balance: 0.0,
    capabilities: [
      {
        service_type: "image_generation",
        pricing: { model: "per_unit", unit_price: 1.5, currency: "USD" },
        description: "DALL-E 3 photorealistic product images, 1024x1024",
      },
    ],
  },
];

async function seed() {
  for (const agent of AGENTS) {
    const hash = await bcrypt.hash(agent.rawKey, 10);

    const { data, error } = await supabase
      .from("agents")
      .upsert(
        {
          name: agent.name,
          type: agent.type,
          api_key_hash: hash,
          balance: agent.balance,
          capabilities: agent.capabilities,
        },
        { onConflict: "api_key_hash" }
      )
      .select()
      .single();

    if (error) {
      console.error(`Failed to seed ${agent.name}:`, error.message);
    } else {
      console.log(`Seeded ${agent.name} (${data.id}) — API Key: ${agent.rawKey}`);
    }
  }

  console.log("\nDone. Run the demo:");
  console.log("  Terminal 1: npm run vendor");
  console.log("  Terminal 2: npm run buyer");
}

seed();
