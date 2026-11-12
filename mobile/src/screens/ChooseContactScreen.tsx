import { useState } from "react";
import { Alert, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MainStackParamList } from "../navigation/types";
import { useAuth } from "../contexts/AuthContext";
import { usePairs } from "../hooks/usePairs";
import { createInvite } from "../utils/inviteActions";
import { partnerNameFor } from "../utils/transactionPresentation";
import { CURRENCIES } from "../types";
import { Screen, Card, Heading, ui, report } from "../components/Screen";
import TextField from "../components/TextField";
import Choices from "../components/Choices";
import Button from "../components/Button";
export default function ChooseContactScreen({
  navigation,
}: NativeStackScreenProps<MainStackParamList, "ChooseContact">) {
  const { user, profile } = useAuth();
  const { pairs } = usePairs();
  const [email, setEmail] = useState("");
  const [currency, setCurrency] = useState(profile?.currency || "USD");
  const [busy, setBusy] = useState(false);
  async function invite() {
    if (!user) return;
    setBusy(true);
    try {
      const result = await createInvite(
        user,
        profile?.displayName || "",
        email,
        currency,
        pairs,
      );
      if (result.delivery.skipped)
        Alert.alert(
          "Invitation saved",
          "Email could not be delivered. Copy the link from Pending Connections.",
        );
      navigation.replace("AddTransaction", { pairId: result.pairId });
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading>Record a transaction</Heading>
      <Text style={ui.muted}>Choose a contact, or invite someone new.</Text>
      {pairs
        .filter((p) => p.status !== "removed")
        .map((p) => (
          <Card key={p.id}>
            <Button
              title={
                p.status === "pending"
                  ? p.userEmails[1]
                  : partnerNameFor(p, user!.uid)
              }
              variant="secondary"
              onPress={() =>
                navigation.replace("AddTransaction", { pairId: p.id })
              }
            />
          </Card>
        ))}
      <Card>
        <Heading>New contact</Heading>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Text style={ui.muted}>Currency</Text>
        <Choices
          value={currency}
          options={CURRENCIES.map((c) => c.code)}
          onChange={setCurrency}
        />
        <Button
          title="Invite and record transaction"
          loading={busy}
          onPress={invite}
        />
        <Text style={ui.muted}>
          The request stays pending until the invitation is accepted and your
          partner approves it.
        </Text>
      </Card>
    </Screen>
  );
}
