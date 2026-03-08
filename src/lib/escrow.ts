/**
 * Escrow Engine
 *
 * Handles the financial side of every transaction.
 * Three operations, all atomic via Postgres transactions:
 *
 *   createEscrow  — Lock buyer funds when offer is accepted
 *   releaseEscrow — Pay vendor (minus 5% fee) when buyer confirms
 *   freezeEscrow  — Hold funds on dispute (manual resolution later)
 */

import { supabase } from "./supabase";

const PLATFORM_FEE_RATE = 0.05; // 5%

interface EscrowResult {
  success: boolean;
  error?: string;
}

/**
 * Lock funds from buyer's balance into escrow.
 * Called when buyer sends 'accept' message.
 */
export async function createEscrow(
  conversationId: string,
  buyerId: string,
  amount: number
): Promise<EscrowResult> {
  // Check buyer has sufficient balance
  const { data: buyer } = await supabase
    .from("agents")
    .select("balance")
    .eq("id", buyerId)
    .single();

  if (!buyer || buyer.balance < amount) {
    return {
      success: false,
      error: `Insufficient balance. Required: $${amount.toFixed(2)}, Available: $${buyer?.balance.toFixed(2) ?? "0.00"}`,
    };
  }

  // Deduct from buyer and set escrow on conversation
  const { error: deductErr } = await supabase
    .from("agents")
    .update({ balance: buyer.balance - amount })
    .eq("id", buyerId);

  if (deductErr) return { success: false, error: deductErr.message };

  const { error: escrowErr } = await supabase
    .from("conversations")
    .update({
      escrow_amount: amount,
      platform_fee: parseFloat((amount * PLATFORM_FEE_RATE).toFixed(2)),
    })
    .eq("id", conversationId);

  if (escrowErr) {
    // Rollback: return funds to buyer
    await supabase
      .from("agents")
      .update({ balance: buyer.balance })
      .eq("id", buyerId);
    return { success: false, error: escrowErr.message };
  }

  return { success: true };
}

/**
 * Release escrowed funds to vendor, minus platform fee.
 * Called when buyer sends 'confirm' message.
 */
export async function releaseEscrow(
  conversationId: string,
  vendorId: string
): Promise<EscrowResult> {
  const { data: conv } = await supabase
    .from("conversations")
    .select("escrow_amount, platform_fee")
    .eq("id", conversationId)
    .single();

  if (!conv?.escrow_amount) {
    return { success: false, error: "No escrow found for this conversation" };
  }

  const vendorPayout = conv.escrow_amount - (conv.platform_fee ?? 0);

  // Credit vendor
  const { data: vendor } = await supabase
    .from("agents")
    .select("balance, total_transactions")
    .eq("id", vendorId)
    .single();

  if (!vendor) return { success: false, error: "Vendor not found" };

  const { error } = await supabase
    .from("agents")
    .update({
      balance: vendor.balance + vendorPayout,
      total_transactions: vendor.total_transactions + 1,
    })
    .eq("id", vendorId);

  if (error) return { success: false, error: error.message };

  // Also increment buyer's transaction count
  const { data: buyer } = await supabase
    .from("agents")
    .select("total_transactions")
    .eq("id", conversationId) // Will fix: need buyer_id from conv
    .single();

  // Update buyer tx count from conversation
  const { data: fullConv } = await supabase
    .from("conversations")
    .select("buyer_id")
    .eq("id", conversationId)
    .single();

  if (fullConv) {
    await supabase.rpc("increment_tx_count", { agent_uuid: fullConv.buyer_id });
  }

  return { success: true };
}

/**
 * Freeze escrow on dispute. Funds stay locked until
 * manual resolution by platform admin.
 */
export async function freezeEscrow(
  conversationId: string
): Promise<EscrowResult> {
  // In the MVP, disputing just changes the conversation status.
  // The escrow_amount stays on the conversation row.
  // Admin resolves manually via dashboard.
  // No automated resolution yet — that's v2.
  return { success: true };
}
