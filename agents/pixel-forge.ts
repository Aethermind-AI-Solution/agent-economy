/**
 * PixelForge — Demo Vendor Agent
 *
 * Autonomous image generation vendor that:
 * 1. Polls for incoming RFQs
 * 2. Responds with a fixed-rate offer ($1.50/image)
 * 3. On acceptance, generates images via OpenAI DALL-E 3
 * 4. Delivers image URLs back to the platform
 *
 * Run: npx tsx agents/pixel-forge.ts
 */

import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import { AgentSDK } from "../src/lib/sdk";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, "../.env.local");

// Parse .env.local to get the file values directly
const envFromFile = dotenv.config({ path: envPath, quiet: true });

// PLATFORM_URL: prefer CLI env var over file (standard dotenv behavior)
const PLATFORM_URL = process.env.PLATFORM_URL ?? "http://localhost:3000";

// OPENAI_API_KEY: always trust the file value — shell may have a stale placeholder
const OPENAI_KEY = envFromFile.parsed?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error("FATAL: OPENAI_API_KEY not set. Check .env.local file.");
  process.exit(1);
}

const API_KEY = process.env.VENDOR_API_KEY ?? "pk_vendor_pixelforge_demo_key_001";
const UNIT_PRICE = 1.5;
const POLL_INTERVAL = 5_000; // 5 seconds

const sdk = new AgentSDK(PLATFORM_URL, API_KEY);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

function log(msg: string) {
  console.log(`[PixelForge ${new Date().toISOString()}] ${msg}`);
}

async function handleRFQs() {
  const conversations = await sdk.listConversations({
    status: "rfq_sent",
    role: "vendor",
  });

  for (const conv of conversations) {
    const rfq = conv.rfq_payload;
    const quantity = rfq.requirements?.quantity ?? 1;
    const price = quantity * UNIT_PRICE;

    log(`RFQ received [${conv.id}]: ${quantity} images, budget $${rfq.max_budget}`);

    // Auto-respond with offer if within their budget
    if (rfq.max_budget && price > rfq.max_budget) {
      log(`  Skipping — our price ($${price}) exceeds their budget ($${rfq.max_budget})`);
      continue;
    }

    log(`  Sending offer: $${price} (${quantity} × $${UNIT_PRICE})`);
    await sdk.sendMessage(conv.id, "offer", {
      price,
      currency: "USD",
      delivery_time_seconds: quantity * 30,
      details: `${quantity}x 1024×1024 photorealistic PNGs via DALL-E 3`,
    });
  }
}

async function handleAccepted() {
  const conversations = await sdk.listConversations({
    status: "accepted",
    role: "vendor",
  });

  for (const conv of conversations) {
    const rfq = conv.rfq_payload;
    const quantity = rfq.requirements?.quantity ?? 1;
    const style = rfq.requirements?.style ?? "product photo";
    const dimensions = rfq.requirements?.dimensions ?? "1024x1024";

    log(`Accepted order [${conv.id}]: generating ${quantity} images...`);

    const artifacts: { type: string; url: string }[] = [];
    const startTime = Date.now();

    for (let i = 0; i < quantity; i++) {
      try {
        log(`  Generating image ${i + 1}/${quantity}...`);
        const response = await openai.images.generate({
          model: "dall-e-3",
          prompt: style,
          size: dimensions as "1024x1024",
          quality: "standard",
          n: 1,
        });

        const url = response.data[0]?.url;
        if (url) {
          artifacts.push({ type: "image_url", url });
          log(`  Image ${i + 1} generated OK`);
        }
      } catch (err: any) {
        log(`  Image ${i + 1} generation failed: ${err.message}`);
        if (err.status === 401) {
          log(`  OpenAI auth failed — check OPENAI_API_KEY in .env.local`);
          log(`  Key prefix: ${process.env.OPENAI_API_KEY?.slice(0, 8)}...`);
          break; // No point retrying with a bad key
        }
        // Still deliver what we have
      }
    }

    const elapsedMs = Date.now() - startTime;

    if (artifacts.length === 0) {
      log(`  All images failed to generate. Skipping delivery.`);
      continue;
    }

    log(`  Delivering ${artifacts.length} images (took ${(elapsedMs / 1000).toFixed(1)}s)`);
    await sdk.sendMessage(conv.id, "deliver", {
      artifacts,
      metadata: {
        model: "dall-e-3",
        generation_time_ms: elapsedMs,
        requested: quantity,
        delivered: artifacts.length,
      },
    });
  }
}

async function run() {
  log("PixelForge vendor agent starting...");
  log(`Pricing: $${UNIT_PRICE}/image | Polling every ${POLL_INTERVAL / 1000}s`);

  const profile = await sdk.getProfile();
  log(`Balance: $${profile.agent.balance.toFixed(2)} | Transactions: ${profile.agent.total_transactions}`);

  // Main event loop
  while (true) {
    try {
      await handleRFQs();
      await handleAccepted();
    } catch (err: any) {
      log(`Error in poll cycle: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
}

run().catch((err) => {
  log(`FATAL ERROR: ${err.message}`);
  process.exit(1);
});
