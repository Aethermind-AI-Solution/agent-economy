/**
 * ProcureBot — Demo Buyer Agent
 *
 * Autonomous procurement agent that:
 * 1. Searches for image generation vendors
 * 2. Sends an RFQ for 5 product images
 * 3. Evaluates the offer (simple budget check)
 * 4. Accepts and waits for delivery
 * 5. Verifies image URLs exist
 * 6. Confirms delivery → transaction complete
 *
 * Run: npx tsx agents/procure-bot.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import { AgentSDK } from "../src/lib/sdk";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const PLATFORM_URL = process.env.PLATFORM_URL ?? "http://localhost:3000";
const API_KEY = process.env.BUYER_API_KEY ?? "pk_buyer_procurebot_demo_key_001";
const MAX_BUDGET = 10.0;
const IMAGE_COUNT = 5;

const sdk = new AgentSDK(PLATFORM_URL, API_KEY);

function log(msg: string) {
  console.log(`[ProcureBot ${new Date().toISOString()}] ${msg}`);
}

async function verifyImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function run() {
  log("Starting autonomous procurement cycle");

  // 1. Check our balance
  const profile = await sdk.getProfile();
  log(`Balance: $${profile.agent.balance.toFixed(2)}`);

  if (profile.agent.balance < MAX_BUDGET) {
    log("Insufficient balance. Aborting.");
    return;
  }

  // 2. Search for image generation vendors
  log("Searching for image_generation vendors...");
  const vendors = await sdk.searchServices("image_generation");

  if (vendors.length === 0) {
    log("No vendors found. Aborting.");
    return;
  }

  // 3. Pick the best vendor (highest reputation, price within budget)
  const affordable = vendors.filter(
    (v) => v.service.pricing.unit_price * IMAGE_COUNT <= MAX_BUDGET
  );

  if (affordable.length === 0) {
    log("No vendors within budget. Aborting.");
    return;
  }

  const vendor = affordable.sort(
    (a, b) => b.reputation.score - a.reputation.score
  )[0];

  log(`Selected vendor: ${vendor.agent_name} (rating: ${vendor.reputation.score}, price: $${vendor.service.pricing.unit_price}/image)`);

  // 4. Send RFQ
  log("Sending RFQ...");
  const conv = await sdk.createConversation(vendor.agent_id, "image_generation", {
    requirements: {
      quantity: IMAGE_COUNT,
      style: "photorealistic product photo, white background, studio lighting",
      dimensions: "1024x1024",
      format: "png",
    },
    max_budget: MAX_BUDGET,
    currency: "USD",
  });

  log(`Conversation created: ${conv.id} (status: ${conv.status})`);

  // 5. Wait for vendor offer
  log("Waiting for vendor offer...");
  const withOffer = await sdk.waitForStatus(conv.id, "offer_sent", 60_000);
  const offer = withOffer.offer_payload;

  log(`Offer received: $${offer.price} — ${offer.details}`);

  // 6. Evaluate: simple budget check
  if (offer.price > MAX_BUDGET) {
    log(`Offer exceeds budget ($${offer.price} > $${MAX_BUDGET}). Rejecting.`);
    await sdk.sendMessage(conv.id, "reject", { reason: "Over budget" });
    return;
  }

  // 7. Accept offer
  log(`Accepting offer for $${offer.price}`);
  await sdk.sendMessage(conv.id, "accept");

  // 8. Wait for delivery
  log("Waiting for image delivery...");
  const delivered = await sdk.waitForStatus(conv.id, "delivered", 180_000);
  const artifacts = delivered.delivery_payload?.artifacts ?? [];

  log(`Delivery received: ${artifacts.length} artifacts`);

  // 9. Verify each image URL
  let validCount = 0;
  for (const artifact of artifacts) {
    const valid = await verifyImageUrl(artifact.url);
    log(`  ${artifact.url.slice(0, 60)}... → ${valid ? "OK" : "FAILED"}`);
    if (valid) validCount++;
  }

  // 10. Confirm or dispute
  if (validCount === artifacts.length && validCount > 0) {
    log(`All ${validCount} images verified. Confirming delivery.`);
    await sdk.sendMessage(conv.id, "confirm");
    log("TRANSACTION COMPLETE");
  } else {
    log(`Only ${validCount}/${artifacts.length} images valid. Disputing.`);
    await sdk.sendMessage(conv.id, "dispute", {
      reason: `${artifacts.length - validCount} images failed verification`,
    });
  }

  // 11. Final balance check
  const finalProfile = await sdk.getProfile();
  log(`Final balance: $${finalProfile.agent.balance.toFixed(2)}`);
  log("Procurement cycle complete.");
}

run().catch((err) => {
  log(`FATAL ERROR: ${err.message}`);
  process.exit(1);
});
