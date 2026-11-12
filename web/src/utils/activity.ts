import { Transaction } from "@/types";
import { transactionEventDateMillis } from "@/utils/transactionDate";
export type Period = "7D" | "30D" | "90D" | "1Y" | "all";
function periodStartMs(period: Period): number {
  if (period === "all") return 0;
  const now = Date.now();
  const days: Record<Exclude<Period, "all">, number> = {
    "7D": 7,
    "30D": 30,
    "90D": 90,
    "1Y": 365,
  };
  return now - days[period] * 24 * 60 * 60 * 1000;
}

function bucketLabel(date: Date, period: Period): string {
  if (period === "7D") {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  if (period === "30D" || period === "90D") {
    // Weekly buckets: "May 4"
    const monday = new Date(date);
    monday.setDate(date.getDate() - date.getDay() + 1);
    return monday.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  // Monthly for 1Y / all
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function bucketKey(date: Date, period: Period): string {
  if (period === "7D") {
    return date.toISOString().slice(0, 10);
  }
  if (period === "30D" || period === "90D") {
    const monday = new Date(date);
    monday.setDate(date.getDate() - date.getDay() + 1);
    return monday.toISOString().slice(0, 10);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function buildActivity(transactions: Transaction[], period: Period) {
  const cutoff = periodStartMs(period);
  const approved = transactions.filter(
    (tx) =>
      tx.status === "approved" &&
      tx.type !== "settlement" &&
      tx.type !== "forgiveness",
  );

  const bucketed = new Map<
    string,
    { label: string; received: number; paid: number }
  >();

  for (const tx of approved) {
    // Group activity by when it happened, not when it was entered or approved.
    // Older transactions did not store an event date, so retain their
    // creation timestamp as a backwards-compatible fallback.
    const ts = transactionEventDateMillis(tx);
    if (ts < cutoff) continue;
    const date = new Date(ts);
    const key = bucketKey(date, period);
    if (!bucketed.has(key)) {
      bucketed.set(key, {
        label: bucketLabel(date, period),
        received: 0,
        paid: 0,
      });
    }
    const bucket = bucketed.get(key)!;
    if (tx.type === "payment") {
      bucket.received += tx.amount;
    } else {
      bucket.paid += tx.amount;
    }
  }

  return Array.from(bucketed.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      ...v,
      received: parseFloat(v.received.toFixed(2)),
      paid: parseFloat(v.paid.toFixed(2)),
    }));
}
