import { ScrollView, Text, Pressable, View } from "react-native";
import { Pair, Transaction } from "../types";
import { formatAmount } from "../utils/currency";
import {
  partnerNameFor,
  obligationText,
} from "../utils/transactionPresentation";
import { transactionEventDate } from "../utils/transactionDate";
import { ui } from "./Screen";
export default function TransactionTable({
  transactions,
  pairs,
  userId,
  onOpen,
}: {
  transactions: Transaction[];
  pairs: Pair[];
  userId: string;
  onOpen: (pairId: string, transactionId?: string) => void;
}) {
  return (
    <ScrollView horizontal>
      <View>
        <View
          style={[
            ui.row,
            { backgroundColor: "#EFF6FF", padding: 12, flexWrap: "nowrap" },
          ]}
        >
          {[
            "Date",
            "Contact",
            "Amount",
            "Balance effect",
            "Status",
            "Description",
          ].map((t) => (
            <Text key={t} style={{ width: 140, fontWeight: "700" }}>
              {t}
            </Text>
          ))}
        </View>
        {transactions.map((tx) => {
          const pair = pairs.find((p) => p.id === tx.pairId);
          if (!pair) return null;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${tx.description || tx.type} with ${partnerNameFor(pair, userId)}`}
              key={`${tx.pairId}/${tx.id}`}
              onPress={() => onOpen(pair.id, tx.id)}
              style={[
                ui.row,
                {
                  padding: 12,
                  borderBottomWidth: 1,
                  borderColor: "#E5E7EB",
                  flexWrap: "nowrap",
                  minHeight: 48,
                },
              ]}
            >
              {[
                transactionEventDate(tx)?.toLocaleDateString() || "",
                partnerNameFor(pair, userId),
                formatAmount(tx.amount, pair.currency),
                obligationText(tx, pair, userId) || tx.type,
                tx.status,
                tx.description,
              ].map((value, i) => (
                <Text key={i} style={{ width: 140 }}>
                  {value}
                </Text>
              ))}
            </Pressable>
          );
        })}
        {!transactions.length && (
          <Text style={ui.muted}>No matching transactions.</Text>
        )}
      </View>
    </ScrollView>
  );
}
