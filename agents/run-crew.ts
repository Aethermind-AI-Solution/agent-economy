/**
 * run-crew.ts — Lead Generation Crew Orchestrator
 *
 * Runs all three agents in sequence:
 *   1. ResearchAgent  — finds 30-50 Indian companies needing AI automation
 *   2. DataAgent      — enriches + scores to top 20
 *   3. SalesAgent     — drafts personalized outreach for top 10
 *
 * Each agent handoff goes through the platform as a real paid transaction,
 * visible in the admin dashboard.
 *
 * Usage:
 *   npx tsx agents/run-crew.ts "healthcare companies in India that need AI automation"
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load env before any other imports that use module-level env reads
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

import Anthropic from "@anthropic-ai/sdk";
import { AgentSDK } from "../src/lib/sdk";
import { registerResearchAgent, findCompaniesParallel } from "./research-agent";
import { registerDataAgent, enrichAndScore } from "./data-agent";
import { registerSalesAgent, draftOutreach } from "./sales-agent";
import { createCrewRun, completeCrewRun, failCrewRun, saveDrafts } from "../src/lib/crew-runs";

const CREW_NAME = "RunCrew";

function ts() {
  return new Date().toTimeString().slice(0, 8);
}
function log(msg: string) {
  console.log(`[${CREW_NAME} ${ts()}] ${msg}`);
}

/**
 * Drive a full platform transaction between buyer and vendor agents.
 * The work function is called AFTER accept and BEFORE deliver, so
 * the vendor can compute its output synchronously.
 */
async function platformHandoff(opts: {
  label: string;
  buyerSdk: AgentSDK;
  vendorSdk: AgentSDK;
  vendorAgentId: string;
  serviceType: string;
  rfqPayload: Record<string, any>;
  work: () => Promise<Record<string, any>>; // returns delivery payload
}): Promise<Record<string, any>> {
  const { label, buyerSdk, vendorSdk, vendorAgentId, serviceType, rfqPayload, work } = opts;

  log(`\n--- Handoff: ${label} ---`);

  // Step 1: Buyer creates conversation (rfq_sent)
  const conv = await buyerSdk.createConversation(vendorAgentId, serviceType, rfqPayload);
  log(`Conversation created: ${conv.id} (status: ${conv.status})`);

  // Step 2: Vendor sends offer (offer_sent)
  await vendorSdk.sendMessage(conv.id, "offer", {
    price: 1.0,
    currency: "USD",
    delivery_time_seconds: 120,
    details: `${serviceType} service`,
  });
  log("Offer sent by vendor");

  // Step 3: Buyer accepts (accepted → escrow created)
  await buyerSdk.sendMessage(conv.id, "accept");
  log("Offer accepted by buyer (escrow created)");

  // Step 4: Vendor does the work (with 150s timeout)
  log("Vendor working...");
  const deliveryPayload = await Promise.race([
    work(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Step "${label}" timed out after 150s`)), 150_000)
    ),
  ]);

  // Step 5: Vendor delivers (delivered)
  await vendorSdk.sendMessage(conv.id, "deliver", deliveryPayload);
  log("Delivery sent by vendor");

  // Step 6: Buyer confirms (completed → escrow released)
  await buyerSdk.sendMessage(conv.id, "confirm");
  log(`Transaction complete: ${conv.id} ✓`);

  return deliveryPayload;
}

async function checkPlatform(platformUrl: string) {
  try {
    const res = await fetch(`${platformUrl}/api/agents/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ __ping: true }), // will 400, but proves server is up
      signal: AbortSignal.timeout(5_000),
    });
    // Any JSON response (even error) means the platform is up
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new Error("Platform returned non-JSON — wrong URL or port?");
    }
  } catch (err: any) {
    if (err.name === "TimeoutError" || err.code === "ECONNREFUSED" || err.cause?.code === "ECONNREFUSED") {
      console.error(`FATAL: Platform at ${platformUrl} is not reachable.`);
      console.error(`       Start the dev server first: npm run dev`);
    } else {
      console.error(`FATAL: Platform check failed — ${err.message}`);
    }
    process.exit(1);
  }
}

async function main() {
  const query = process.argv[2];
  if (!query || query.trim().length < 10) {
    console.error(`Usage: npx tsx agents/run-crew.ts "<search query>"`);
    console.error(`       Query must be at least 10 characters.`);
    console.error(`Example: npx tsx agents/run-crew.ts "healthcare companies in India that need AI automation"`);
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("FATAL: ANTHROPIC_API_KEY not set in .env.local");
    process.exit(1);
  }

  const platformUrl = process.env.PLATFORM_URL ?? "http://localhost:3000";

  // Fail fast if platform is unreachable
  await checkPlatform(platformUrl);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  log("=".repeat(50));
  log("Aethermind Lead Generation Crew");
  log(`Query: "${query}"`);
  log("=".repeat(50));

  // Use an existing run record (passed by the API trigger) or create a new one
  const runId = process.env.RUN_ID || await createCrewRun(query);
  if (runId) log(`Run ID: ${runId}`);

  try {
    // ── Register all 3 agents ──────────────────────────────────────────────────
    log("\nRegistering agents...");
    const [research, data, sales] = await Promise.all([
      registerResearchAgent(platformUrl),
      registerDataAgent(platformUrl),
      registerSalesAgent(platformUrl),
    ]);
    log(`ResearchAgent: ${research.agentId}`);
    log(`DataAgent:     ${data.agentId}`);
    log(`SalesAgent:    ${sales.agentId}`);

    // ── Step 1: Research ───────────────────────────────────────────────────────
    log("\n" + "=".repeat(50));
    log("Step 1: Research");
    log("=".repeat(50));
    const companies = await findCompaniesParallel(query, anthropic, research.sdk, research.agentId);
    log(`Found ${companies.length} companies`);

    // ── Handoff 1: ResearchAgent → DataAgent ──────────────────────────────────
    log("\n" + "=".repeat(50));
    log("Step 2: Enrichment (via platform)");
    log("=".repeat(50));

    let scoredLeads: any[];
    await platformHandoff({
      label: "ResearchAgent → DataAgent",
      buyerSdk: research.sdk,
      vendorSdk: data.sdk,
      vendorAgentId: data.agentId,
      serviceType: "lead_enrichment",
      rfqPayload: { query, companies },
      work: async () => {
        scoredLeads = await enrichAndScore(companies, anthropic, data.sdk);
        return {
          artifacts: [{ type: "scored_leads", data: scoredLeads }],
        };
      },
    });

    log(`Top ${scoredLeads!.length} leads scored:`);
    for (const lead of scoredLeads!.slice(0, 5)) {
      log(`  [${lead.score}/10] ${lead.company_name} — ${lead.industry}`);
    }
    if (scoredLeads!.length > 5) {
      log(`  ... and ${scoredLeads!.length - 5} more`);
    }

    // ── Handoff 2: DataAgent → SalesAgent ─────────────────────────────────────
    log("\n" + "=".repeat(50));
    log("Step 3: Outreach Drafting (via platform)");
    log("=".repeat(50));

    let outreachDrafts: any[];
    await platformHandoff({
      label: "DataAgent → SalesAgent",
      buyerSdk: data.sdk,
      vendorSdk: sales.sdk,
      vendorAgentId: sales.agentId,
      serviceType: "outreach_drafting",
      rfqPayload: { scoredLeads: scoredLeads! },
      work: async () => {
        outreachDrafts = await draftOutreach(scoredLeads!, anthropic, sales.sdk);
        return {
          artifacts: [{ type: "outreach_drafts", data: outreachDrafts }],
        };
      },
    });

    // ── Persist results ────────────────────────────────────────────────────────
    if (runId) {
      await Promise.all([
        completeCrewRun(runId, {
          company_count: companies.length,
          lead_count: scoredLeads!.length,
          draft_count: outreachDrafts!.length,
        }),
        saveDrafts(runId, outreachDrafts!),
      ]);
      log(`Run saved: ${runId}`);
    }

    // ── Print Results ──────────────────────────────────────────────────────────
    log("\n" + "=".repeat(50));
    log(`OUTREACH DRAFTS (${outreachDrafts!.length} leads)`);
    log("=".repeat(50));

    for (let i = 0; i < outreachDrafts!.length; i++) {
      const draft = outreachDrafts![i];
      console.log(`\n${"─".repeat(60)}`);
      console.log(`#${i + 1}  ${draft.company_name}  [Score: ${draft.score}/10]`);
      console.log(`    Decision Maker: ${draft.decision_maker}`);
      console.log(`\n  EMAIL`);
      console.log(`  Subject: ${draft.subject_line}`);
      console.log(`\n${draft.email_body
        .split("\n")
        .map((l: string) => `  ${l}`)
        .join("\n")}`);
      console.log(`\n  LINKEDIN`);
      console.log(`\n${draft.linkedin_message
        .split("\n")
        .map((l: string) => `  ${l}`)
        .join("\n")}`);
    }

    console.log(`\n${"=".repeat(60)}`);
    log("Crew run complete.");
    log(`Review the ${outreachDrafts!.length} drafts above, edit as needed, then send manually.`);
  } catch (err: any) {
    if (runId) await failCrewRun(runId, err.message);
    throw err;
  }
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
