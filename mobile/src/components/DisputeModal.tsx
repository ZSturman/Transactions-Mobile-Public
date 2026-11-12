import { useState } from "react";
import { Alert, Modal, StyleSheet, Text, View } from "react-native";
import Button from "./Button";
import TextField from "./TextField";
import { colors, radius, spacing } from "../theme";

interface DisputeModalProps {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (reason: string, proposedAmount?: number) => void;
  loading?: boolean;
}

export default function DisputeModal({
  visible,
  onCancel,
  onSubmit,
  loading,
}: DisputeModalProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  function handleSubmit() {
    if (!reason.trim()) return;
    const proposed = amount.trim() ? Number(amount) : undefined;
    if (
      proposed !== undefined &&
      (!Number.isFinite(proposed) || proposed <= 0)
    ) {
      Alert.alert("Invalid amount", "Enter a positive counter-proposal.");
      return;
    }
    onSubmit(reason.trim(), proposed);
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Dispute this transaction</Text>
          <Text style={styles.subtitle}>
            Let your partner know why you're disputing it.
          </Text>
          <TextField
            placeholder="e.g. I already paid this in cash"
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            style={styles.textarea}
          />
          <TextField
            label="Counter-proposal amount (optional)"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <View style={styles.actions}>
            <Button title="Cancel" variant="secondary" onPress={onCancel} />
            <Button
              title="Submit dispute"
              variant="danger"
              onPress={handleSubmit}
              loading={loading}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  textarea: { height: 90, textAlignVertical: "top" },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
});
