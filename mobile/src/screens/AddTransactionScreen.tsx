import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Timestamp } from "firebase/firestore";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { usePairs } from "../hooks/usePairs";
import { useTransactions } from "../hooks/useTransactions";
import { transactionEventDate } from "../utils/transactionDate";
import {
  createTransaction,
  editTransaction,
} from "../utils/transactionActions";
import { formatAmount } from "../utils/currency";
import {
  partnerNameFor,
  splitDebtAmount,
  splitDetailsFor,
  TransactionEntryMode,
} from "../utils/transactionPresentation";
import Button from "../components/Button";
import TextField from "../components/TextField";
import { colors, spacing } from "../theme";
import { MainStackParamList } from "../navigation/types";
import { TransactionType } from "../types";

type Props = NativeStackScreenProps<MainStackParamList, "AddTransaction">;

export default function AddTransactionScreen({ route, navigation }: Props) {
  const { pairId, transactionId } = route.params;
  const { transactions } = useTransactions(pairId);
  const editing = transactions.find((t) => t.id === transactionId);
  const { user } = useAuth();
  const { pairs } = usePairs();
  const pair = pairs.find((p) => p.id === pairId);

  const [type, setType] =
    useState<Extract<TransactionType, "payment" | "request">>("payment");
  const [mode, setMode] = useState<TransactionEntryMode>("payment");
  const [share, setShare] = useState("50");
  const [txDate, setTxDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  });
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!editing) return;
    setAmount(String(editing.amount));
    setDescription(editing.description);
    setType(editing.type === "payment" ? "payment" : "request");
    const date = transactionEventDate(editing);
    if (date)
      setTxDate(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      );
  }, [editing?.id]);

  if (!pair || !user)
    return (
      <View style={{ padding: 24 }}>
        <Text>Loading contact…</Text>
      </View>
    );

  const partnerName = partnerNameFor(pair, user.uid);

  async function handleSubmit() {
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert("Invalid amount", "Enter an amount greater than 0.");
      return;
    }
    const percentage = Number(share);
    if (
      mode === "split" &&
      (!share.trim() ||
        !Number.isFinite(percentage) ||
        percentage < 0 ||
        percentage > 100)
    ) {
      Alert.alert("Invalid split", "Enter your share between 0% and 100%.");
      return;
    }
    const direction = type === "payment" ? "i_paid" : "they_paid";
    const debt =
      mode === "split"
        ? splitDebtAmount(parsed, percentage, direction)
        : Math.round(parsed * 100) / 100;
    if (debt <= 0) {
      Alert.alert(
        "Invalid amount",
        "This leaves no amount owed. Enter a larger amount or change the split.",
      );
      return;
    }
    const date = new Date(txDate + "T12:00:00");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(txDate) ||
      !Number.isFinite(date.getTime()) ||
      date.getFullYear() !== Number(txDate.slice(0, 4)) ||
      date.getMonth() + 1 !== Number(txDate.slice(5, 7)) ||
      date.getDate() !== Number(txDate.slice(8, 10)) ||
      date > new Date(new Date().setHours(23, 59, 59, 999))
    ) {
      Alert.alert(
        "Invalid date",
        "Use YYYY-MM-DD and choose today or an earlier date.",
      );
      return;
    }

    setLoading(true);
    try {
      if (transactionId) {
        if (
          !editing ||
          editing.createdBy !== user!.uid ||
          editing.status !== "pending"
        )
          throw new Error("This transaction can no longer be edited.");
        await editTransaction(pairId, transactionId, {
          amount: debt,
          description: description.trim(),
          date: Timestamp.fromDate(date),
        });
        navigation.goBack();
        return;
      }
      const result = await createTransaction(pair!, user!.uid, {
        amount: debt,
        type,
        description:
          description.trim() ||
          (mode === "split" ? "Split expense" : "Payment"),
        date: Timestamp.fromDate(date),
        ...(mode === "split" && {
          split: splitDetailsFor(parsed, percentage, direction),
        }),
      });
      Alert.alert(
        result.autoApproved ? "Recorded" : "Sent",
        result.autoApproved
          ? "The balance was updated automatically."
          : `Waiting for ${partnerName} to approve.`,
      );
      navigation.goBack();
    } catch (err) {
      Alert.alert("Couldn't save this", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {!transactionId && (
          <>
            <View style={styles.typeRow}>
              <TypeOption
                label="Record a balance"
                selected={mode === "payment"}
                onPress={() => setMode("payment")}
              />
              <TypeOption
                label="Split an expense"
                selected={mode === "split"}
                onPress={() => setMode("split")}
              />
            </View>
            <Text style={styles.label}>
              {mode === "split" ? "Who paid the full bill?" : "Who owes whom?"}
            </Text>
            <View style={styles.typeRow}>
              <TypeOption
                label={
                  mode === "split" ? "You paid" : `${partnerName} owes you`
                }
                selected={type === "payment"}
                onPress={() => setType("payment")}
              />
              <TypeOption
                label={
                  mode === "split"
                    ? `${partnerName} paid`
                    : `You owe ${partnerName}`
                }
                selected={type === "request"}
                onPress={() => setType("request")}
              />
            </View>
          </>
        )}
        <TextField
          label={`${mode === "split" ? "We spent" : "Amount owed"} (${pair.currency})`}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
        {mode === "split" && (
          <>
            <TextField
              label="Your share (%)"
              value={share}
              onChangeText={setShare}
              keyboardType="decimal-pad"
              placeholder="50"
            />
            <Text style={styles.hint}>
              {type === "payment"
                ? `${partnerName} owes you`
                : `You owe ${partnerName}`}{" "}
              {formatAmount(
                Number.isFinite(Number(amount)) &&
                  Number.isFinite(Number(share)) &&
                  Number(share) >= 0 &&
                  Number(share) <= 100
                  ? splitDebtAmount(
                      Number(amount),
                      Number(share),
                      type === "payment" ? "i_paid" : "they_paid",
                    )
                  : 0,
                pair.currency,
              )}
            </Text>
          </>
        )}
        <TextField
          label="Date (YYYY-MM-DD)"
          value={txDate}
          onChangeText={setTxDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <TextField
          label="Description (optional)"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Dinner on Friday"
          maxLength={200}
        />

        {pair.status === "pending" ? (
          <Text style={styles.hint}>
            Queued until your partner accepts the invitation.
          </Text>
        ) : pair.autoApprove ? (
          <Text style={styles.hint}>
            Auto-approve is on for this contact — this will update the balance
            immediately.
          </Text>
        ) : (
          <Text style={styles.hint}>
            {partnerName} will need to approve this before it affects the
            balance.
          </Text>
        )}

        <Button
          title={transactionId ? "Save changes" : "Save transaction"}
          onPress={handleSubmit}
          loading={loading}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TypeOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      title={label}
      variant={selected ? "primary" : "secondary"}
      onPress={onPress}
      small
    />
  );
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err)
    return String((err as Error).message);
  return "Something went wrong. Try again.";
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.lg },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  typeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.lg,
    flexWrap: "wrap",
  },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.lg },
});
