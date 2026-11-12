import { useEffect, useState } from "react";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Transaction } from "../types";
import { sortTransactionsByEventDate } from "../utils/transactionDate";

export function useTransactions(
  pairId: string | undefined,
  includeArchived = false,
) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pairId) {
      setTransactions([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "pairs", pairId, "transactions"),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Transaction,
        );
        const filtered = items.filter(
          (t) => includeArchived || t.archived !== true,
        );
        setTransactions(sortTransactionsByEventDate(filtered));
        setLoading(false);
      },
      (error) => {
        if (error.code !== "permission-denied") {
          console.error(
            `Transactions listener error for pair ${pairId}:`,
            error,
          );
        }
        setTransactions([]);
        setLoading(false);
      },
    );

    return unsub;
  }, [pairId, includeArchived]);

  return { transactions, loading };
}
