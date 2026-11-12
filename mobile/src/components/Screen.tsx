import { ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "../theme";
export function report(error: unknown) {
  Alert.alert(
    "Transactions",
    error instanceof Error ? error.message : "Please try again.",
  );
}
export async function perform(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    report(error);
  }
}
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={ui.page}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={ui.card}>{children}</View>;
}
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={ui.heading}>
      {children}
    </Text>
  );
}
export const ui = StyleSheet.create({
  page: {
    padding: 16,
    gap: 16,
    width: "100%",
    maxWidth: 1000,
    alignSelf: "center",
    paddingBottom: 40,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  heading: { fontSize: 22, fontWeight: "700", color: colors.text },
  title: { fontSize: 16, fontWeight: "600", color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  row: { flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  amount: { fontSize: 28, fontWeight: "700", color: colors.primary },
});
