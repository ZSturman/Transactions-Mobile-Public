import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { doc, getDoc } from "firebase/firestore";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../contexts/AuthContext";
import { useInviteLink } from "../contexts/InviteLinkContext";
import { usePairs } from "../hooks/usePairs";
import { useInvites, isInviteExpired } from "../hooks/useInvites";
import { useAllTransactions } from "../hooks/useAllTransactions";
import { formatAmount, formatSignedAmount } from "../utils/currency";
import { partnerNameFor } from "../utils/transactionPresentation";
import { computePendingBalance } from "../utils/pendingBalance";
import {
  buildNetBalanceHistory,
  buildPairBalanceHistory,
} from "../utils/balanceHistory";
import { Period } from "../utils/activity";
import { appOrigin } from "../lib/api";
import { db } from "../lib/firebase";
import { Invite } from "../types";
import { MainStackParamList } from "../navigation/types";
import Button from "../components/Button";
import Choices from "../components/Choices";
import TextField from "../components/TextField";
import { Screen, Card, Heading, ui, perform } from "../components/Screen";
import { BalanceChart, ActivityChart, periods } from "../components/Charts";
import TransactionTable from "../components/TransactionTable";

type Props = NativeStackScreenProps<MainStackParamList, "Pairs">;
export default function PairsListScreen({ navigation }: Props) {
  const { user, profile } = useAuth();
  const { pairs, loading } = usePairs();
  const { pendingInvites, sentInvites, acceptInvite, cancelInvite } =
    useInvites();
  const { transactions: all, loading: txLoading } = useAllTransactions(pairs, {
    includePending: true,
  });
  const { inviteId, clear } = useInviteLink();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [contact, setContact] = useState("all");
  const [period, setPeriod] = useState<Period>("30D");
  const [view, setView] = useState("Cards");
  const active = pairs.filter((p) => p.status === "active");
  const pending = pairs.filter((p) => p.status === "pending");
  const activeIds = new Set(active.map((p) => p.id));
  const transactions = all.filter((t) => activeIds.has(t.pairId));
  const balances = active.map((p) =>
    computePendingBalance(
      p,
      transactions.filter((t) => t.pairId === p.id),
      user!.uid,
    ),
  );
  const owed = balances.reduce((v, b) => v + Math.max(0, b.currentBalance), 0);
  const owe = balances.reduce((v, b) => v + Math.max(0, -b.currentBalance), 0);
  const including = balances.reduce((v, b) => v + b.balanceIncludingPending, 0);
  const currency = profile?.currency || "USD";
  const history = useMemo(
    () =>
      user
        ? buildNetBalanceHistory(
            all.filter((t) =>
              pairs.some((p) => p.id === t.pairId && p.status === "active"),
            ),
            pairs.filter((p) => p.status === "active"),
            user.uid,
          )
        : [],
    [all, pairs, user],
  );
  const filtered = transactions.filter((t) => {
    const p = active.find((p) => p.id === t.pairId)!;
    const q = search.trim().toLowerCase();
    return (
      (status === "all" || t.status === status) &&
      (type === "all" || t.type === type) &&
      (contact === "all" || p.id === contact) &&
      (!q ||
        [
          t.description,
          t.type,
          String(t.amount),
          partnerNameFor(p, user!.uid),
          ...p.userEmails,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q))
    );
  });
  const filteredPairs = active
    .filter((p) => contact === "all" || p.id === contact)
    .filter(
      (p) =>
        (!search &&
          !["pending", "approved", "disputed"].includes(status) &&
          type === "all") ||
        filtered.some((t) => t.pairId === p.id) ||
        (status === "all" &&
          type === "all" &&
          partnerNameFor(p, user!.uid)
            .toLowerCase()
            .includes(search.trim().toLowerCase())),
    );
  const needsAction = transactions.filter(
    (t) => t.status === "pending" && t.createdBy !== user?.uid,
  );
  async function acceptLink() {
    const snap = await getDoc(doc(db, "invites", inviteId!));
    if (!snap.exists())
      throw new Error("This invitation is no longer available.");
    const invitation = { id: snap.id, ...snap.data() } as Invite;
    if (isInviteExpired(invitation))
      throw new Error(
        "This invitation has expired. Ask the sender for a new link.",
      );
    await acceptInvite(invitation);
    clear();
    navigation.navigate("PairDetail", { pairId: invitation.pairId });
  }
  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
    >
      <Screen>
        <View style={[ui.row, { justifyContent: "space-between" }]}>
          <Heading>Transactions</Heading>
          <Button
            title="Settings"
            small
            variant="ghost"
            onPress={() => navigation.navigate("Settings")}
          />
        </View>
        <View style={[ui.row, { justifyContent: "space-between" }]}>
          <View>
            <Heading>
              {profile?.displayName
                ? `Hi, ${profile.displayName.split(" ")[0]}`
                : "Dashboard"}
            </Heading>
            <Text style={ui.muted}>Here’s your money overview</Text>
          </View>
          <Button
            title="+ Transaction"
            small
            onPress={() => navigation.navigate("ChooseContact")}
          />
        </View>
        {loading || txLoading ? (
          <ActivityIndicator accessibilityLabel="Loading dashboard" />
        ) : null}
        {inviteId && (
          <Card>
            <Text style={ui.title}>Open invitation</Text>
            <Text style={ui.muted}>
              Accept using the email address that received the invitation.
            </Text>
            <View style={ui.row}>
              <Button
                title="Accept invitation"
                onPress={() => perform(acceptLink)}
              />
              <Button title="Dismiss" variant="ghost" onPress={clear} />
            </View>
          </Card>
        )}
        {pendingInvites.map((invite) => (
          <Card key={invite.id}>
            <Text style={ui.title}>{invite.fromName} invited you</Text>
            <Button
              title="Accept"
              onPress={() => perform(() => acceptInvite(invite))}
            />
          </Card>
        ))}
        {needsAction.length > 0 && (
          <Card>
            <Text style={ui.title}>
              {needsAction.length}{" "}
              {needsAction.length === 1
                ? "transaction needs"
                : "transactions need"}{" "}
              your review
            </Text>
            <Button
              title="Review pending transactions"
              small
              onPress={() => {
                setStatus("pending");
                setView("Table");
              }}
            />
          </Card>
        )}
        {active.length > 0 && (
          <>
            <Card>
              <Text style={ui.muted}>NET BALANCE</Text>
              <Text
                style={[
                  ui.amount,
                  { color: owed - owe >= 0 ? "#16A34A" : "#DC2626" },
                ]}
              >
                {formatSignedAmount(owed - owe, currency)}
              </Text>
              <Text style={ui.muted}>
                {owed > owe
                  ? "Overall, you are owed money"
                  : owe > owed
                    ? "Overall, you owe money"
                    : "You’re all settled up"}
              </Text>
              {Math.abs(including - (owed - owe)) >= 0.005 && (
                <Text style={ui.muted}>
                  Including pending: {formatSignedAmount(including, currency)}
                </Text>
              )}
              <Choices value={period} options={periods} onChange={setPeriod} />
              <BalanceChart
                points={history}
                currency={currency}
                period={period}
              />
            </Card>
            <View style={ui.row}>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Card>
                  <Text style={ui.muted}>Owed to you</Text>
                  <Text style={[ui.heading, { color: "#15803D" }]}>
                    {formatAmount(owed, currency)}
                  </Text>
                </Card>
              </View>
              <View style={{ flex: 1, minWidth: 130 }}>
                <Card>
                  <Text style={ui.muted}>You owe</Text>
                  <Text style={[ui.heading, { color: "#B91C1C" }]}>
                    {formatAmount(owe, currency)}
                  </Text>
                </Card>
              </View>
            </View>
            <Card>
              <Text style={ui.title}>Activity</Text>
              <ActivityChart
                transactions={transactions}
                currency={currency}
                period={period}
              />
            </Card>
            <Heading>Active balances</Heading>
            <Choices
              value={view}
              options={["Cards", "Table"]}
              onChange={setView}
            />
            <TextField
              label="Search transactions or contacts"
              value={search}
              onChangeText={setSearch}
            />
            <Choices
              value={status}
              options={["all", "pending", "approved", "disputed"]}
              onChange={setStatus}
            />
            <Choices
              value={type}
              options={[
                "all",
                "payment",
                "request",
                "adjustment",
                "settlement",
                "forgiveness",
              ]}
              onChange={setType}
            />
            <Choices
              value={contact}
              options={[
                { value: "all", label: "All contacts" },
                ...active.map((p) => ({
                  value: p.id,
                  label: partnerNameFor(p, user!.uid),
                })),
              ]}
              onChange={setContact}
            />
            <View style={ui.row}>
              <Text style={ui.muted}>
                {filtered.length} of {transactions.length} transactions
              </Text>
              <Button
                title="Clear filters"
                small
                variant="ghost"
                onPress={() => {
                  setSearch("");
                  setStatus("all");
                  setType("all");
                  setContact("all");
                }}
              />
            </View>
            {view === "Table" ? (
              <TransactionTable
                transactions={filtered}
                pairs={active}
                userId={user!.uid}
                onOpen={(pairId) =>
                  navigation.navigate("PairDetail", { pairId })
                }
              />
            ) : (
              filteredPairs.map((pair) => (
                <Pressable
                  key={pair.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${partnerNameFor(pair, user!.uid)}`}
                  onPress={() =>
                    navigation.navigate("PairDetail", { pairId: pair.id })
                  }
                >
                  <Card>
                    <Text style={ui.title}>
                      {partnerNameFor(pair, user!.uid)}
                    </Text>
                    <Text style={ui.muted}>
                      {(pair.users[0] === user!.uid
                        ? pair.balance
                        : -pair.balance) > 0
                        ? "Owes you"
                        : (pair.users[0] === user!.uid
                              ? pair.balance
                              : -pair.balance) < 0
                          ? "You owe"
                          : "Settled up"}
                    </Text>
                    <Text style={ui.amount}>
                      {formatSignedAmount(
                        pair.users[0] === user!.uid
                          ? pair.balance
                          : -pair.balance,
                        pair.currency,
                      )}
                    </Text>
                    <BalanceChart
                      mini
                      points={buildPairBalanceHistory(
                        transactions.filter((t) => t.pairId === pair.id),
                        pair,
                        user!.uid,
                      )}
                      currency={pair.currency}
                    />
                  </Card>
                </Pressable>
              ))
            )}
            {!filtered.length && (
              <Text style={ui.muted}>No matching transactions.</Text>
            )}
          </>
        )}
        {pending.length > 0 && <Heading>Pending connections</Heading>}
        {pending.map((pair) => {
          const invite = sentInvites.find((i) => i.pairId === pair.id);
          return (
            <Card key={pair.id}>
              <Text style={ui.title}>{pair.userEmails[1]}</Text>
              <Text style={ui.muted}>
                Waiting for acceptance ·{" "}
                {
                  all.filter(
                    (t) => t.pairId === pair.id && t.status === "pending",
                  ).length
                }{" "}
                queued requests
              </Text>
              <View style={ui.row}>
                <Button
                  title="+ Request"
                  small
                  onPress={() =>
                    navigation.navigate("AddTransaction", { pairId: pair.id })
                  }
                />
                {invite && (
                  <>
                    <Button
                      title="Copy link"
                      small
                      variant="secondary"
                      onPress={() =>
                        perform(async () => {
                          await Clipboard.setStringAsync(
                            `${appOrigin()}/invite/${invite.id}`,
                          );
                          Alert.alert("Link copied");
                        })
                      }
                    />
                    <Button
                      title="Cancel invite"
                      small
                      variant="ghost"
                      onPress={() =>
                        Alert.alert(
                          "Cancel invitation?",
                          "Queued requests will be removed.",
                          [
                            { text: "Keep", style: "cancel" },
                            {
                              text: "Cancel invitation",
                              style: "destructive",
                              onPress: () =>
                                perform(() => cancelInvite(invite)),
                            },
                          ],
                        )
                      }
                    />
                  </>
                )}
              </View>
            </Card>
          );
        })}
        {!loading && !active.length && !pending.length && (
          <Card>
            <Heading>No transactions yet</Heading>
            <Text style={ui.muted}>
              Start by recording a transaction with someone.
            </Text>
            <Button
              title="+ Transaction"
              onPress={() => navigation.navigate("ChooseContact")}
            />
          </Card>
        )}
      </Screen>
    </SafeAreaView>
  );
}
