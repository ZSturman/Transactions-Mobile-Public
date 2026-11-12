"use client";

import { formatAmount } from "@/utils/currency";
import { Pair, Transaction } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { computePendingBalance } from "@/utils/pendingBalance";

interface BalanceSummaryProps {
  pair: Pair;
  transactions?: Transaction[];
}

export default function BalanceSummary({ pair, transactions = [] }: BalanceSummaryProps) {
  const { user } = useAuth();
  if (!user) return null;

  const idx = pair.users.indexOf(user.uid);
  const partnerName = pair.userNames[idx === 0 ? 1 : 0];
  const { currentBalance, pendingIn, pendingOut, balanceIncludingPending } =
    computePendingBalance(pair, transactions, user.uid);
  const hasPending = pendingIn > 0 || pendingOut > 0;

  return (
    <div className="text-center py-6">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Current Balance</p>
      <p
        data-testid="current-balance"
        className={`text-4xl font-bold ${
          currentBalance > 0
            ? "text-green-600"
            : currentBalance < 0
            ? "text-red-600"
            : "text-gray-400"
        }`}
      >
        {currentBalance > 0 ? "+" : ""}
        {formatAmount(currentBalance, pair.currency)}
      </p>
      <p className="text-sm text-gray-500 mt-1">
        {currentBalance > 0
          ? `${partnerName} owes you`
          : currentBalance < 0
          ? `You owe ${partnerName}`
          : `All settled up with ${partnerName}`}
      </p>

      {hasPending && (
        <div data-testid="pending-summary" className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pending</p>
          <p className="text-sm font-semibold">
            {pendingIn > 0 && (
              <span data-testid="pending-in" className="text-green-600">
                +{formatAmount(pendingIn, pair.currency)}
              </span>
            )}
            {pendingIn > 0 && pendingOut > 0 && <span className="text-gray-300 mx-1.5">/</span>}
            {pendingOut > 0 && (
              <span data-testid="pending-out" className="text-red-600">
                -{formatAmount(pendingOut, pair.currency)}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400 uppercase tracking-wide mt-3 mb-1">
            Balance Including Pending
          </p>
          <p
            data-testid="balance-including-pending"
            className={`text-lg font-bold ${
              balanceIncludingPending > 0
                ? "text-green-600"
                : balanceIncludingPending < 0
                ? "text-red-600"
                : "text-gray-400"
            }`}
          >
            {balanceIncludingPending > 0 ? "+" : ""}
            {formatAmount(balanceIncludingPending, pair.currency)}
          </p>
        </div>
      )}
    </div>
  );
}
