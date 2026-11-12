import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { Pair, Transaction } from "../types";
import { formatAmount } from "../utils/currency";
import {
  obligationText,
  partnerNameFor,
} from "../utils/transactionPresentation";
import { transactionEventDate } from "../utils/transactionDate";
import Button from "./Button";
import {
  declineTransaction,
  acceptCounter,
  rejectCounter,
  archiveTransaction,
  unarchiveTransaction,
} from "../utils/transactionActions";
import DisputeModal from "./DisputeModal";
import { colors, radius, spacing } from "../theme";

interface TransactionRowProps {
  transaction: Transaction;
  pair: Pair;
  userId: string;
  onApprove: (tx: Transaction) => Promise<void>;
  onDispute: (
    tx: Transaction,
    reason: string,
    proposedAmount?: number,
  ) => Promise<void>;
  onDenySettlement: (tx: Transaction) => Promise<void>;
  onEdit?: (tx: Transaction) => void;
  onCancel: (tx: Transaction) => Promise<void>;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  pending: { bg: colors.pendingBg, text: colors.pendingText },
  approved: { bg: colors.successBg, text: colors.successText },
  disputed: { bg: colors.disputedBg, text: colors.disputedText },
};

export default function TransactionRow({
  transaction: tx,
  pair,
  userId,
  onApprove,
  onDispute,
  onDenySettlement,
  onCancel,
  onEdit,
}: TransactionRowProps) {
  const [busy, setBusy] = useState(false);
  const [showDispute, setShowDispute] = useState(false);

  const isCreator = tx.createdBy === userId;
  const idx = pair.users.indexOf(userId);
  const creatorName = isCreator ? "You" : pair.userNames[idx === 0 ? 1 : 0];
  const directObligation = obligationText(tx, pair, userId);
  const canRespond =
    pair.status === "active" && tx.status === "pending" && !isCreator;
  const canCancel =
    pair.status !== "removed" && tx.status === "pending" && isCreator;

  const displayDate = transactionEventDate(tx);
  const dateLabel = displayDate
    ? displayDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Just now";

  let label: string;
  if (tx.type === "settlement") {
    label =
      tx.status === "approved"
        ? isCreator
          ? "You settled"
          : `${creatorName} settled`
        : tx.status === "disputed"
          ? isCreator
            ? "Your settlement request was denied"
            : `${creatorName} requested settlement`
          : isCreator
            ? "You requested settlement"
            : `${creatorName} requested settlement`;
  } else {
    label = `${tx.split ? "Split expense · " : ""}${directObligation ?? "Adjustment"}`;
  }

  const statusLabel =
    tx.type === "settlement"
      ? tx.status === "approved"
        ? "settled"
        : tx.status === "disputed"
          ? "denied"
          : "pending"
      : tx.status;
  const statusStyle = statusStyles[tx.status] ?? {
    bg: "#F3F4F6",
    text: colors.textMuted,
  };

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      Alert.alert("Couldn't complete that", errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      style={[
        styles.card,
        tx.status === "disputed" && styles.disputedBorder,
        canRespond && styles.pendingBorder,
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.left}>
          <View style={styles.badgeRow}>
            <View style={[styles.badge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.badgeText, { color: statusStyle.text }]}>
                {statusLabel}
              </Text>
            </View>
            <Text style={styles.date}>{dateLabel}</Text>
          </View>
          <Text style={styles.label}>{label}</Text>
          {tx.split && (
            <Text style={styles.description}>
              We spent {formatAmount(tx.split.totalAmount, pair.currency)} · you{" "}
              {isCreator
                ? tx.split.creatorSharePercent
                : 100 - tx.split.creatorSharePercent}
              % / {partnerNameFor(pair, userId)}{" "}
              {isCreator
                ? 100 - tx.split.creatorSharePercent
                : tx.split.creatorSharePercent}
              %.{" "}
              {(tx.split.paidBy === "creator") === isCreator
                ? "You paid the bill."
                : `${partnerNameFor(pair, userId)} paid the bill.`}
            </Text>
          )}
          {tx.description ? (
            <Text style={styles.description}>{tx.description}</Text>
          ) : null}
          {tx.status === "disputed" && tx.disputeReason ? (
            <Text style={styles.disputeReason}>
              Dispute: "{tx.disputeReason}"
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.amount,
            tx.type === "settlement"
              ? styles.amountMuted
              : directObligation?.startsWith("You owe")
                ? styles.amountNegative
                : directObligation
                  ? styles.amountPositive
                  : styles.amountMuted,
          ]}
        >
          {formatAmount(tx.amount, pair.currency)}
        </Text>
      </View>

      {canRespond && tx.type === "settlement" && (
        <View style={styles.actions}>
          <Button
            title="Approve"
            small
            onPress={() => run(() => onApprove(tx))}
            loading={busy}
          />
          <Button
            title="Deny"
            small
            variant="danger"
            onPress={() => run(() => onDenySettlement(tx))}
            loading={busy}
          />
        </View>
      )}

      {canRespond && tx.type !== "settlement" && (
        <View style={styles.actions}>
          <Button
            title="Approve"
            small
            onPress={() => run(() => onApprove(tx))}
            loading={busy}
          />
          <Button
            title="Decline"
            small
            variant="secondary"
            disabled={busy}
            onPress={() => run(() => declineTransaction(pair, tx, userId))}
          />
          <Button
            title="Dispute"
            small
            variant="danger"
            onPress={() => setShowDispute(true)}
          />
        </View>
      )}

      {canCancel && (
        <View style={styles.cancelRow}>
          {tx.type !== "settlement" && pair.status === "active" && onEdit && (
            <Button
              title="Edit"
              small
              variant="secondary"
              disabled={busy}
              onPress={() => onEdit(tx)}
            />
          )}
          <Button
            title="Cancel request"
            small
            variant="ghost"
            onPress={() => run(() => onCancel(tx))}
            loading={busy}
          />
        </View>
      )}

      {pair.status === "active" &&
        tx.status === "disputed" &&
        typeof tx.proposedAmount === "number" && (
          <View style={styles.actions}>
            <Text style={styles.description}>
              Counter-proposal: {formatAmount(tx.proposedAmount, pair.currency)}
            </Text>
            {isCreator && (
              <>
                <Button
                  title="Accept counter"
                  small
                  disabled={busy}
                  onPress={() => run(() => acceptCounter(pair, tx, userId))}
                />
                <Button
                  title="Reject counter"
                  small
                  variant="secondary"
                  disabled={busy}
                  onPress={() => run(() => rejectCounter(pair, tx))}
                />
              </>
            )}
          </View>
        )}
      {pair.status === "active" && tx.status === "approved" && (
        <Button
          title={tx.archived ? "Restore transaction" : "Archive transaction"}
          small
          variant="ghost"
          disabled={busy}
          onPress={() =>
            run(() =>
              tx.archived
                ? unarchiveTransaction(pair.id, tx.id)
                : archiveTransaction(pair.id, tx.id),
            )
          }
        />
      )}
      <DisputeModal
        visible={showDispute}
        onCancel={() => setShowDispute(false)}
        loading={busy}
        onSubmit={(reason, proposedAmount) =>
          run(async () => {
            await onDispute(tx, reason, proposedAmount);
            setShowDispute(false);
          })
        }
      />
    </View>
  );
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err)
    return String((err as Error).message);
  return "Something went wrong. Try again.";
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  disputedBorder: { borderColor: "#FCA5A5" },
  pendingBorder: { borderColor: "#BFDBFE", backgroundColor: "#F5F8FF" },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  left: { flex: 1 },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  date: { fontSize: 11, color: colors.textFaint },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  description: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  disputeReason: {
    fontSize: 12,
    color: colors.dangerText,
    marginTop: spacing.xs,
    fontStyle: "italic",
  },
  amount: { fontSize: 16, fontWeight: "700" },
  amountPositive: { color: colors.successText },
  amountNegative: { color: colors.dangerText },
  amountMuted: { color: colors.textMuted },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
