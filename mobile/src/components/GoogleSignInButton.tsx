import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import {
  GoogleSigninButton,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing } from "../theme";

export default function GoogleSignInButton({
  disabled = false,
  onBusyChange,
}: {
  disabled?: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { signInGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    onBusyChange(true);
    try {
      await signInGoogle();
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === statusCodes.SIGN_IN_CANCELLED
      )
        return;
      Alert.alert(
        "Couldn't sign in with Google",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <View style={styles.container}>
      <GoogleSigninButton
        style={styles.button}
        size={GoogleSigninButton.Size.Wide}
        color={GoogleSigninButton.Color.Light}
        disabled={disabled || busy}
        onPress={signIn}
      />
      {busy && (
        <ActivityIndicator
          color={colors.primary}
          accessibilityLabel="Signing in with Google"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, gap: spacing.sm },
  button: { width: "100%", height: 48 },
});
