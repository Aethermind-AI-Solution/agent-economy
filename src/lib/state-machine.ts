/**
 * Conversation State Machine
 *
 * This is the single most critical file in the codebase.
 * Every transaction flows through these transitions.
 * If you change this file, you change the business.
 *
 * States:
 *   rfq_sent → offer_sent → accepted → delivered → completed
 *                  ↓            ↓          ↓
 *               rejected     expired    disputed
 *   rfq_sent → expired (auto, 5min timeout)
 *   delivered → completed (auto, 48h timeout)
 */

export type ConversationStatus =
  | "rfq_sent"
  | "offer_sent"
  | "accepted"
  | "delivered"
  | "completed"
  | "rejected"
  | "disputed"
  | "expired";

export type MessageType =
  | "offer"
  | "accept"
  | "reject"
  | "deliver"
  | "confirm"
  | "dispute";

/** Who is allowed to send each message type */
type Role = "buyer" | "vendor" | "system";

interface Transition {
  from: ConversationStatus;
  to: ConversationStatus;
  allowedBy: Role;
  sideEffect?: "create_escrow" | "release_escrow" | "freeze_escrow";
}

const TRANSITIONS: Record<MessageType, Transition> = {
  offer: {
    from: "rfq_sent",
    to: "offer_sent",
    allowedBy: "vendor",
  },
  accept: {
    from: "offer_sent",
    to: "accepted",
    allowedBy: "buyer",
    sideEffect: "create_escrow",
  },
  reject: {
    from: "offer_sent",
    to: "rejected",
    allowedBy: "buyer",
  },
  deliver: {
    from: "accepted",
    to: "delivered",
    allowedBy: "vendor",
  },
  confirm: {
    from: "delivered",
    to: "completed",
    allowedBy: "buyer",
    sideEffect: "release_escrow",
  },
  dispute: {
    from: "delivered",
    to: "disputed",
    allowedBy: "buyer",
    sideEffect: "freeze_escrow",
  },
};

export interface TransitionResult {
  valid: boolean;
  newStatus?: ConversationStatus;
  sideEffect?: "create_escrow" | "release_escrow" | "freeze_escrow";
  error?: string;
}

/**
 * Validate whether a state transition is allowed.
 *
 * @param currentStatus  Current conversation status
 * @param messageType    The message being sent
 * @param senderRole     Is the sender the buyer or vendor in this conversation?
 */
export function validateTransition(
  currentStatus: ConversationStatus,
  messageType: MessageType,
  senderRole: "buyer" | "vendor"
): TransitionResult {
  const transition = TRANSITIONS[messageType];

  if (!transition) {
    return { valid: false, error: `Unknown message type: ${messageType}` };
  }

  if (currentStatus !== transition.from) {
    return {
      valid: false,
      error: `Cannot send '${messageType}' when conversation is '${currentStatus}'. Required: '${transition.from}'`,
    };
  }

  if (senderRole !== transition.allowedBy) {
    return {
      valid: false,
      error: `Only the ${transition.allowedBy} can send '${messageType}'. You are the ${senderRole}.`,
    };
  }

  return {
    valid: true,
    newStatus: transition.to,
    sideEffect: transition.sideEffect,
  };
}

/** Terminal states — conversation is over, no more transitions */
export function isTerminal(status: ConversationStatus): boolean {
  return ["completed", "rejected", "disputed", "expired"].includes(status);
}

/** Get allowed next actions for a given role and status */
export function getAllowedActions(
  status: ConversationStatus,
  role: "buyer" | "vendor"
): MessageType[] {
  if (isTerminal(status)) return [];

  return (Object.entries(TRANSITIONS) as [MessageType, Transition][])
    .filter(([_, t]) => t.from === status && t.allowedBy === role)
    .map(([type]) => type);
}
