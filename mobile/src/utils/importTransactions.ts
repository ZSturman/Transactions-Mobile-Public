import {
  collection,
  doc,
  getDocs,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { sendTransactionEmail } from "../lib/email";
import { Pair, Transaction } from "../types";
import {
  CsvRow,
  FieldKey,
  ParsedRow,
  dateAtNoon,
  parseAmount,
  parseType,
  parseDirection,
  parseDate,
  normaliseDescription,
  fingerprintFor,
  existingFingerprint,
  stableId,
  BATCH_SIZE,
} from "./csvImport";

export function validateRows(
  rows: CsvRow[],
  mapping: Record<string, FieldKey>,
  existing: Transaction[],
  today = new Date(),
): ParsedRow[] {
  const reverse: Partial<Record<FieldKey, string>> = {};
  for (const [header, field] of Object.entries(mapping))
    if (field !== "ignore") {
      if (reverse[field]) throw new Error(`Map only one column to ${field}.`);
      reverse[field] = header;
    }
  if (!reverse.amount || (!reverse.type && !reverse.direction))
    throw new Error("Map Amount and either Balance effect or Type.");
  const known = new Set(existing.map(existingFingerprint).filter(Boolean));
  return rows.map((raw, index) => {
    const errors: string[] = [];
    const amount = parseAmount(raw[reverse.amount!] || "");
    const rawType = reverse.type ? raw[reverse.type]?.trim() : "";
    const mappedType = rawType ? parseType(rawType) : null;
    let direction = reverse.direction
      ? parseDirection(raw[reverse.direction] || "")
      : null;
    if (!direction && mappedType === "payment") direction = "i_paid";
    if (!direction && mappedType === "request") direction = "they_paid";
    if (!direction && amount.negative) direction = "i_paid";
    const type =
      mappedType ??
      (direction === "i_paid"
        ? "payment"
        : direction === "they_paid"
          ? "request"
          : null);
    const description = normaliseDescription(
      reverse.description ? raw[reverse.description] || "" : "",
    );
    const rawDate = reverse.date ? raw[reverse.date]?.trim() : "";
    const date = rawDate ? parseDate(rawDate) : dateAtNoon(today);
    if (amount.amount === null || amount.amount <= 0)
      errors.push("enter a positive amount");
    if (!direction) errors.push("map a direction or payment/request type");
    if (rawType && !mappedType) errors.push("unknown transaction type");
    if (rawDate && !date) errors.push("invalid date");
    if (description.length > 200)
      errors.push("description exceeds 200 characters");
    const row: ParsedRow = {
      rowNumber: index + 2,
      amount: amount.amount,
      direction,
      type,
      description,
      date: date ?? dateAtNoon(today),
      errors,
      fingerprint: null,
      duplicate: false,
    };
    if (!errors.length) row.fingerprint = fingerprintFor(row);
    row.duplicate = Boolean(row.fingerprint && known.has(row.fingerprint));
    if (row.fingerprint) known.add(row.fingerprint);
    return row;
  });
}
export async function existingTransactions(pairId: string) {
  const snap = await getDocs(collection(db, "pairs", pairId, "transactions"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction);
}
export async function importTransactions(
  pair: Pair,
  userId: string,
  rows: ParsedRow[],
  onProgress: (count: number) => void,
) {
  const valid = rows.filter(
    (r) => !r.errors.length && !r.duplicate && r.fingerprint,
  );
  let imported = 0;
  let duplicates = 0;
  const batchId = `csv_${Date.now().toString(36)}`;
  for (let offset = 0; offset < valid.length; offset += BATCH_SIZE) {
    const slice = valid.slice(offset, offset + BATCH_SIZE);
    const result = await runTransaction(db, async (tx) => {
      const current = await tx.get(doc(db, "pairs", pair.id));
      if (
        !current.exists() ||
        current.data().status !== "active" ||
        !current.data().users.includes(userId)
      )
        throw new Error("Connection is no longer active.");
      const refs = slice.map((r) =>
        doc(db, "pairs", pair.id, "transactions", stableId(r.fingerprint!)),
      );
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      const written: string[] = [];
      snapshots.forEach((snap, i) => {
        if (snap.exists()) return;
        const row = slice[i];
        tx.set(refs[i], {
          pairId: pair.id,
          amount: row.amount,
          type: row.type,
          description:
            row.description ||
            (row.direction === "i_paid" ? "Payment" : "Request"),
          createdBy: userId,
          status: "pending",
          date: Timestamp.fromDate(row.date),
          createdAt: serverTimestamp(),
          importFingerprint: row.fingerprint,
          importBatchId: batchId,
        });
        written.push(refs[i].id);
      });
      return written;
    });
    imported += result.length;
    duplicates += slice.length - result.length;
    onProgress(Math.min(offset + slice.length, valid.length));
    // Email is best-effort; the server's deduplication protects retried requests.
    if (result.length) await sendTransactionEmail(pair.id, result[0]);
  }
  return { imported, duplicates };
}
