import { useEffect, useState } from "react";
import { Alert, Linking, Platform, Switch, Text, View } from "react-native";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updateProfile,
} from "firebase/auth";
import { useAuth } from "../contexts/AuthContext";
import { usePairs } from "../hooks/usePairs";
import { db } from "../lib/firebase";
import { appOrigin, authenticatedRequest } from "../lib/api";
import { reauthenticateGoogle } from "../lib/googleSignIn";
import { linkApple, reauthenticateApple } from "../lib/appleSignIn";
import { exportAllToCsv, exportAllToJson } from "../utils/export";
import {
  CURRENCIES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  Transaction,
} from "../types";
import { Screen, Card, Heading, ui, report } from "../components/Screen";
import Choices from "../components/Choices";
import TextField from "../components/TextField";
import Button from "../components/Button";
export default function SettingsScreen() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const { pairs } = usePairs();
  const [name, setName] = useState(profile?.displayName || "");
  const [currency, setCurrency] = useState(profile?.currency || "USD");
  const [preferences, setPreferences] = useState(
    profile?.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [provider, setProvider] = useState("");
  useEffect(() => {
    if (profile) {
      setName(profile.displayName);
      setCurrency(profile.currency);
      setPreferences(
        profile.notificationPreferences || DEFAULT_NOTIFICATION_PREFERENCES,
      );
    }
  }, [profile]);
  const providers = user?.providerData.map((p) => p.providerId) || [];
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
  async function save() {
    if (!user) return;
    await updateDoc(doc(db, "users", user.uid), {
      displayName: name.trim(),
      currency,
      notificationPreferences: preferences,
    });
    await updateProfile(user, { displayName: name.trim() });
    await refreshProfile();
    Alert.alert("Settings saved");
  }
  async function exportData(format: "csv" | "json") {
    if (!user) return;
    const selected = pairs.filter(
      (p) => p.status === "active" || p.status === "pending",
    );
    const data: Record<string, Transaction[]> = {};
    await Promise.all(
      selected.map(async (p) => {
        const snap = await getDocs(
          collection(db, "pairs", p.id, "transactions"),
        );
        data[p.id] = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Transaction,
        );
      }),
    );
    if (format === "csv") await exportAllToCsv(selected, data, user.uid);
    else await exportAllToJson(selected, data);
  }
  async function deleteAccount() {
    if (!user || confirm !== "DELETE")
      throw new Error("Type DELETE to confirm.");
    const selected = provider || providers[0];
    let appleAuthorizationCode: string | null = null;
    if (providers.includes("apple.com") && Platform.OS !== "ios") {
      await Linking.openURL(`${appOrigin()}/login?continue=%2Fsettings`);
      return;
    }
    if (providers.includes("apple.com"))
      appleAuthorizationCode = await reauthenticateApple();
    else if (selected === "google.com") await reauthenticateGoogle();
    else if (selected === "password" && user.email)
      await reauthenticateWithCredential(
        user,
        EmailAuthProvider.credential(user.email, password),
      );
    else
      throw new Error("Use a linked sign-in provider to verify your identity.");
    await user.getIdToken(true);
    await authenticatedRequest("/api/account/delete", {
      confirmation: "DELETE",
      appleAuthorizationCode,
    });
    await logout();
  }
  return (
    <Screen>
      <Heading>Settings</Heading>
      <Card>
        <TextField
          label="Display name"
          value={name}
          onChangeText={setName}
          maxLength={100}
        />
        <Text style={ui.muted}>Email · {user?.email}</Text>
        <Text style={ui.title}>Default currency</Text>
        <Choices
          value={currency}
          options={CURRENCIES.map((c) => c.code)}
          onChange={setCurrency}
        />
        <Text style={ui.title}>Email notifications</Text>
        <View style={ui.row}>
          <Switch
            accessibilityLabel="Transaction emails"
            value={preferences.transactionEmails}
            onValueChange={(v) =>
              setPreferences({ ...preferences, transactionEmails: v })
            }
          />
          <Text style={{ flex: 1 }}>Transactions needing review</Text>
        </View>
        <View style={ui.row}>
          <Switch
            accessibilityLabel="Activity emails"
            value={preferences.activityEmails}
            onValueChange={(v) =>
              setPreferences({ ...preferences, activityEmails: v })
            }
          />
          <Text style={{ flex: 1 }}>Approvals and disputes</Text>
        </View>
        <Button
          title="Save settings"
          loading={busy}
          onPress={() => run(save)}
        />
      </Card>
      <Card>
        <Heading>Your data</Heading>
        <View style={ui.row}>
          <Button
            title="Export all CSV"
            small
            disabled={busy}
            onPress={() => run(() => exportData("csv"))}
          />
          <Button
            title="Export all JSON"
            small
            disabled={busy}
            onPress={() => run(() => exportData("json"))}
          />
        </View>
      </Card>
      <Card>
        <Heading>Account</Heading>
        {Platform.OS === "ios" && !providers.includes("apple.com") && (
          <>
            <Button
              title="Link Sign in with Apple"
              variant="secondary"
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await linkApple();
                  await refreshProfile();
                  Alert.alert(
                    "Apple linked",
                    "Apple now accesses this same account.",
                  );
                })
              }
            />
            <Text style={ui.muted}>
              Adds Apple to your current account without merging another
              account.
            </Text>
          </>
        )}
        <Button
          title="Log out"
          variant="secondary"
          disabled={busy}
          onPress={() => run(logout)}
        />
        <View style={ui.row}>
          {["privacy", "support", "delete-account"].map((path) => (
            <Button
              key={path}
              title={
                path === "privacy"
                  ? "Privacy"
                  : path === "support"
                    ? "Support"
                    : "Deletion information"
              }
              small
              variant="ghost"
              onPress={() =>
                run(() => Linking.openURL(`${appOrigin()}/${path}`))
              }
            />
          ))}
        </View>
      </Card>
      <Card>
        <Heading>Delete account</Heading>
        <Text style={ui.muted}>
          Permanently removes your profile and login, cancels invitations, and
          anonymizes your identity in shared financial history. Other people’s
          balances and necessary shared records remain.
        </Text>
        <Button
          title="Delete my account…"
          variant="danger"
          disabled={busy}
          onPress={() => setDeleting(!deleting)}
        />
        {deleting && (
          <>
            <Choices
              value={provider || providers[0] || ""}
              options={providers.map((p) => ({
                value: p,
                label:
                  p === "password"
                    ? "Email/password"
                    : p === "google.com"
                      ? "Google"
                      : "Apple",
              }))}
              onChange={setProvider}
            />
            {(provider || providers[0]) === "password" &&
              !providers.includes("apple.com") && (
                <TextField
                  label="Current password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              )}
            <TextField
              label="Type DELETE"
              autoCapitalize="characters"
              value={confirm}
              onChangeText={setConfirm}
            />
            <Button
              title={
                providers.includes("apple.com") && Platform.OS !== "ios"
                  ? "Continue deletion on web"
                  : "Permanently delete account"
              }
              disabled={busy || confirm !== "DELETE"}
              variant="danger"
              onPress={() =>
                Alert.alert(
                  "Permanently delete your account?",
                  "This action cannot be undone.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete account",
                      style: "destructive",
                      onPress: () => run(deleteAccount),
                    },
                  ],
                )
              }
            />
          </>
        )}
      </Card>
    </Screen>
  );
}
