import { Pair, Transaction } from "@/types";

export interface PendingBalanceBreakdown {
  /** The pair's confirmed balance, from the viewer's perspective (positive → viewer is owed). */
  currentBalance: number;
  /** Sum of pending amounts that would increase the viewer's balance if resolved. */
  pendingIn: number;
  /** Sum of pending amounts that would decrease the viewer's balance if resolved. */
  pendingOut: number;
  /** currentBalance + pendingIn - pendingOut. */
  balanceIncludingPending: number;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The signed effect a pending transaction would have on the viewer's balance
 * if it were approved, using the same direction rules as approveTransaction.
 * Returns null for transaction types that never sit in a "pending" state that
 * should be projected (e.g. forgiveness, which is always written pre-approved).
 */
function pendingDeltaForViewer(
  transaction: Transaction,
  pair: Pair,
  userId: string
): number | null {
  const viewerIndex = pair.users.indexOf(userId);
  if (viewerIndex === -1) return null;
  const viewerMultiplier = viewerIndex === 0 ? 1 : -1;

  if (transaction.type === "settlement") {
    // Approving a settlement zeroes the canonical (users[0]-perspective) balance.
    return -pair.balance * viewerMultiplier;
  }

  const creatorIndex = pair.users.indexOf(transaction.createdBy);
  if (creatorIndex === -1) return null;

  const canonicalDelta = transaction.type === "payment"
    ? (creatorIndex === 0 ? transaction.amount : -transaction.amount)
    : (creatorIndex === 0 ? -transaction.amount : transaction.amount);

  return canonicalDelta * viewerMultiplier;
}

/**
 * Split a pair's pending transactions into how much would flow toward the
 * viewer vs. away from them if every pending item were approved, without
 * treating any of it as settled. `currentBalance` remains the pair's
 * confirmed balance; only `balanceIncludingPending` blends in the pending
 * amounts.
 */
export function computePendingBalance(
  pair: Pair,
  transactions: Transaction[],
  userId: string
): PendingBalanceBreakdown {
  const idx = pair.users.indexOf(userId);
  const currentBalance = idx === 0 ? pair.balance : -pair.balance;

  let pendingIn = 0;
  let pendingOut = 0;
  for (const transaction of transactions) {
    if (transaction.status !== "pending") continue;
    const delta = pendingDeltaForViewer(transaction, pair, userId);
    if (delta === null) continue;
    if (delta > 0) pendingIn += delta;
    else if (delta < 0) pendingOut += -delta;
  }

  pendingIn = roundCurrency(pendingIn);
  pendingOut = roundCurrency(pendingOut);

  return {
    currentBalance,
    pendingIn,
    pendingOut,
    balanceIncludingPending: roundCurrency(currentBalance + pendingIn - pendingOut),
  };
}
