import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Pair } from "../types";

export function usePairs() {
  const { user } = useAuth();
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setPairs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "pairs"),
      where("users", "array-contains", user.uid),
      orderBy("updatedAt", "desc"),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.metadata.hasPendingWrites) {
          const removedPairIds = snap
            .docChanges()
            .filter((change) => change.type === "removed")
            .map((change) => change.doc.id);

          if (removedPairIds.length > 0) {
            setPairs((current) =>
              current.filter((pair) => !removedPairIds.includes(pair.id)),
            );
          }
          setLoading(false);
          return;
        }

        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Pair);
        setPairs(items);
        setLoading(false);
      },
      () => {
        setPairs([]);
        setLoading(false);
      },
    );

    return unsub;
  }, [user]);

  return { pairs, loading };
}
