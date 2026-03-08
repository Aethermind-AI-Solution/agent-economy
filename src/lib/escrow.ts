/**
 * Escrow Engine
 *
 * Handles the financial side of every transaction.
 * All operations are atomic via Postgres RPCs (single transaction):
 *
 *   createEscrow  — Lock buyer funds when offer is accepted
 *   releaseEscrow — Pay vendor (minus 5% fee) when buyer confirms
 *   freezeEscrow  — Hold funds on dispute (manual resolution later)
 */

import { supabase } from "./supabase";

interface EscrowResult {
  success: boolean;
  error?: string;
}

/**
 * Lock funds from buyer's balance into escrow.
 * Called when buyer sends 'accept' message.
 *
 * Atomic: uses a Postgres RPC with advisory lock to prevent
 * concurrent balance races.
 */
export async function createEscrow(
  conversationId: string,
  buyerId: string,
  amount: number
): Promise<EscrowResult> {
  const { data, error } = await supabase.rpc("create_escrow", {
    p_conversation_id: conversationId,
    p_buyer_id: buyerId,
    p_amount: amount,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string };
  return result;
}

/**
 * Release escrowed funds to vendor, minus platform fee.
 * Called when buyer sends 'confirm' message.
 *
 * Atomic: credits vendor, increments both parties' tx counts,
 * all in a single Postgres transaction.
 */
export async function releaseEscrow(
  conversationId: string,
  _vendorId?: string // kept for API compat, not used — RPC reads from conversation
): Promise<EscrowResult> {
  const { data, error } = await supabase.rpc("release_escrow", {
    p_conversation_id: conversationId,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string };
  return result;
}

/**
 * Freeze escrow on dispute. Sets escrow_frozen = true so
 * release_escrow will refuse to pay out until admin resolves.
 */
export async function freezeEscrow(
  conversationId: string
): Promise<EscrowResult> {
  const { data, error } = await supabase.rpc("freeze_escrow", {
    p_conversation_id: conversationId,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { success: boolean; error?: string };
  return result;
}
