import { useState } from "react";
import { ActivityIndicator, Alert, Text, View, Switch } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../contexts/AuthContext";
import { usePairs } from "../hooks/usePairs";
import { useTransactions } from "../hooks/useTransactions";
import { formatAmount } from "../utils/currency";
import { partnerNameFor } from "../utils/transactionPresentation";
import { buildPairBalanceHistory } from "../utils/balanceHistory";
import { computePendingBalance } from "../utils/pendingBalance";
import {
  approveTransaction,
  cancelTransaction,
  denySettlement,
  disputeTransaction,
  requestSettlement,
  setAutoApprove,
  archiveResolvedForPair,
  removeConnection,
  forgiveDebt,
} from "../utils/transactionActions";
import { exportPairToCsv, exportPairToJson } from "../utils/export";
import Button from "../components/Button";
import Choices from "../components/Choices";
import TextField from "../components/TextField";
import TransactionRow from "../components/TransactionRow";
import TransactionTable from "../components/TransactionTable";
import { BalanceChart, periods } from "../components/Charts";
import { Period } from "../utils/activity";
import { Screen, Card, Heading, ui, report } from "../components/Screen";
import { MainStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<MainStackParamList, "PairDetail">;
export default function PairDetailScreen({ route, navigation }: Props) {
  const { pairId } = route.params;
  const { user } = useAuth();
  const { pairs, loading } = usePairs();
  const { transactions: all, loading: txLoading } = useTransactions(
    pairId,
    true,
  );
  const [archived, setArchived] = useState(false);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("Cards");
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [forgiving, setForgiving] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const pair = pairs.find((p) => p.id === pairId);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  if (loading || !user)
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  if (!pair)
    return (
      <Screen>
        <Text>This contact is no longer available.</Text>
      </Screen>
    );
  const transactions = all.filter((t) => !t.archived);
  const displayed = all.filter(
    (t) =>
      (archived || !t.archived) && (filter === "all" || t.status === filter),
  );
  const balance = computePendingBalance(pair, transactions, user.uid);
  const active = pair.status === "active";
  function confirm(
    title: string,
    message: string,
    action: () => Promise<unknown>,
  ) {
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", onPress: () => run(action) },
    ]);
  }
  return (
    <Screen>
      <Heading>{partnerNameFor(pair, user.uid)}</Heading>
      {!active && (
        <Text style={ui.muted}>
          {pair.status === "removed"
            ? "Closed connection · read-only history"
            : "Invitation pending · requests are queued"}
        </Text>
      )}
      <Card>
        <Text style={ui.muted}>
          {balance.currentBalance > 0
            ? "Owes you"
            : balance.currentBalance < 0
              ? "You owe"
              : "Settled up"}
        </Text>
        <Text style={ui.amount}>
          {formatAmount(balance.currentBalance, pair.currency)}
        </Text>
        <Text style={ui.muted}>
          Pending in {formatAmount(balance.pendingIn, pair.currency)} · Pending
          out {formatAmount(balance.pendingOut, pair.currency)}
        </Text>
        <Text style={ui.title}>
          Including pending:{" "}
          {formatAmount(balance.balanceIncludingPending, pair.currency)}
        </Text>
        <Choices value={period} options={periods} onChange={setPeriod} />
        <BalanceChart
          points={buildPairBalanceHistory(transactions, pair, user.uid)}
          currency={pair.currency}
          period={period}
        />
      </Card>
      {active && (
        <Card>
          <View style={ui.row}>
            <Text style={ui.title}>Auto-approve</Text>
            <Switch
              accessibilityLabel="Auto-approve new transactions"
              value={pair.autoApprove === true}
              disabled={busy}
              onValueChange={(value) =>
                confirm(
                  "Change auto-approve?",
                  value
                    ? "New payments and requests will immediately change your shared balance."
                    : "New transactions will require partner approval.",
                  () => setAutoApprove(pairId, value),
                )
              }
            />
          </View>
          <Text style={ui.muted}>
            This setting applies to both people. Settlement still requires
            partner approval.
          </Text>
          <View style={ui.row}>
            <Button
              title="+ Transaction"
              disabled={busy}
              onPress={() => navigation.navigate("AddTransaction", { pairId })}
            />
            <Button
              title="Import CSV"
              variant="secondary"
              disabled={busy}
              onPress={() => navigation.navigate("CsvImport", { pairId })}
            />
            {balance.currentBalance !== 0 && (
              <Button
                title="Settle up"
                variant="secondary"
                disabled={
                  busy ||
                  transactions.some(
                    (t) => t.type === "settlement" && t.status === "pending",
                  )
                }
                onPress={() =>
                  confirm(
                    "Request settlement?",
                    "The balance changes only after your partner approves.",
                    () => requestSettlement(pair, user.uid),
                  )
                }
              />
            )}
          </View>
        </Card>
      )}
      <Card>
        <View style={ui.row}>
          <Button
            title="Export CSV"
            small
            variant="secondary"
            disabled={busy}
            onPress={() =>
              run(() => exportPairToCsv(transactions, pair, user.uid))
            }
          />
          <Button
            title="Export JSON"
            small
            variant="secondary"
            disabled={busy}
            onPress={() => run(() => exportPairToJson(transactions, pair))}
          />
          {active && balance.currentBalance > 0 && (
            <Button
              title="Forgive debt…"
              small
              variant="secondary"
              disabled={busy}
              onPress={() => setForgiving(!forgiving)}
            />
          )}
        </View>
        {forgiving && (
          <>
            <TextField
              label={`Amount to forgive (${pair.currency})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
            <TextField
              label="Reason (optional)"
              value={reason}
              onChangeText={setReason}
            />
            <Button
              title="Forgive this amount"
              variant="danger"
              disabled={busy}
              onPress={() =>
                confirm(
                  "Forgive debt?",
                  "This reduces the amount owed to you and cannot be undone.",
                  async () => {
                    await forgiveDebt(pair, user.uid, Number(amount), reason);
                    setForgiving(false);
                  },
                )
              }
            />
          </>
        )}
        {active && pair.balance === 0 && (
          <View style={ui.row}>
            <Button
              title="Archive resolved"
              small
              variant="ghost"
              disabled={busy}
              onPress={() =>
                confirm(
                  "Archive resolved transactions?",
                  "Transactions remain available through Show archived.",
                  () => archiveResolvedForPair(pairId, all),
                )
              }
            />
            <Button
              title="Remove connection"
              small
              variant="ghost"
              disabled={busy}
              onPress={() =>
                confirm(
                  "Remove connection?",
                  "The settled connection becomes read-only.",
                  async () => {
                    await removeConnection(pair);
                    navigation.goBack();
                  },
                )
              }
            />
          </View>
        )}
      </Card>
      <Heading>Transactions</Heading>
      <Choices
        value={filter}
        options={["all", "pending", "approved", "disputed"]}
        onChange={setFilter}
      />
      <View style={ui.row}>
        <Text style={ui.muted}>Show archived</Text>
        <Switch
          accessibilityLabel="Show archived transactions"
          value={archived}
          onValueChange={setArchived}
        />
      </View>
      <Choices value={view} options={["Cards", "Table"]} onChange={setView} />
      {txLoading && <ActivityIndicator />}
      {view === "Table" ? (
        <TransactionTable
          transactions={displayed}
          pairs={[pair]}
          userId={user.uid}
          onOpen={(_, transactionId) => {
            setView("Cards");
          }}
        />
      ) : (
        displayed.map((tx) => (
          <TransactionRow
            key={tx.id}
            transaction={tx}
            pair={pair}
            userId={user.uid}
            onApprove={(t) => approveTransaction(pair, t, user.uid)}
            onDispute={(t, r, a) => disputeTransaction(pair, t, user.uid, r, a)}
            onDenySettlement={(t) => denySettlement(pair, t, user.uid)}
            onCancel={(t) => cancelTransaction(pair.id, t.id)}
            onEdit={(t) =>
              navigation.navigate("AddTransaction", {
                pairId,
                transactionId: t.id,
              })
            }
          />
        ))
      )}
      {!txLoading && !displayed.length && (
        <Text style={ui.muted}>No matching transactions.</Text>
      )}
    </Screen>
  );
}
