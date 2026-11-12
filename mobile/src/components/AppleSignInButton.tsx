import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import * as Apple from "expo-apple-authentication";
import { useAuth } from "../contexts/AuthContext";
import { report } from "./Screen";
export default function AppleSignInButton({
  disabled = false,
  onBusyChange,
}: {
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { signInApple } = useAuth();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS === "ios") void Apple.isAvailableAsync().then(setAvailable);
  }, []);
  if (!available) return null;
  return (
    <View
      style={{ marginBottom: 16, opacity: busy || disabled ? 0.5 : 1 }}
      pointerEvents={busy || disabled ? "none" : "auto"}
    >
      <Apple.AppleAuthenticationButton
        buttonType={Apple.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={Apple.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={8}
        style={{ width: "100%", height: 48 }}
        onPress={async () => {
          setBusy(true);
          onBusyChange?.(true);
          try {
            await signInApple();
          } catch (e) {
            if (
              !(
                e &&
                typeof e === "object" &&
                "code" in e &&
                e.code === "ERR_REQUEST_CANCELED"
              )
            )
              report(e);
          } finally {
            setBusy(false);
            onBusyChange?.(false);
          }
        }}
      />
    </View>
  );
}
