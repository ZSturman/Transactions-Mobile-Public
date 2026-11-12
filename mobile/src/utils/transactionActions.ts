import {
  doc,
  runTransaction,
  serverTimestamp,
  addDoc,
  collection,
  setDoc,
  deleteDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { Pair, SplitDetails, Transaction, TransactionType } from "../types";
import { sendResolvedEmail, sendTransactionEmail } from "../lib/email";
import { transactionEventDate } from "./transactionDate";

async function writeBalanceSnapshot(
  pairId: string,
  newBalance: number,
  reason: string,
  triggeredBy: string,
  transaction?: Transaction,
) {
  const effectiveAt = transaction
    ? transactionEventDate(transaction)
    : undefined;
  await addDoc(collection(db, "pairs", pairId, "balanceSnapshots"), {
    balance: newBalance,
    timestamp: serverTimestamp(),
    triggeredBy,
    reason,
    ...(effectiveAt && { effectiveAt: Timestamp.fromDate(effectiveAt) }),
    ...(transaction && { transactionId: transaction.id }),
  });
}

export interface NewTransactionInput {
  amount: number;
  type: Extract<TransactionType, "payment" | "request">;
  description: string;
  date: Timestamp;
  split?: SplitDetails;
}

/**
 * Record a payment/request transaction, honoring the pair's auto-approve
 * setting. Mirrors web/src/utils/transactionActions.ts createTransaction.
 */
export async function createTransaction(
  pair: Pair,
  userId: string,
  input: NewTransactionInput,
): Promise<{ id: string; autoApproved: boolean }> {
  const txRef = doc(collection(db, "pairs", pair.id, "transactions"));
  const autoApprove = pair.autoApprove === true;

  const baseFields = {
    pairId: pair.id,
    amount: input.amount,
    type: input.type,
    description: input.description,
    createdBy: userId,
    date: input.date,
    ...(input.split && { split: input.split }),
  };

  if (!autoApprove) {
    await setDoc(txRef, {
      ...baseFields,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    await sendTransactionEmail(pair.id, txRef.id);
    return { id: txRef.id, autoApproved: false };
  }

  let newBalance = 0;
  await runTransaction(db, async (firestoreTransaction) => {
    const pairRef = doc(db, "pairs", pair.id);
    const pairSnap = await firestoreTransaction.get(pairRef);
    if (!pairSnap.exists()) throw new Error("Pair not found");
    const pairData = pairSnap.data();
    if (pairData.status !== "active")
      throw new Error("This connection is no longer active");

    const creatorIdx = pairData.users.indexOf(userId);
    const balanceDelta =
      input.type === "payment"
        ? creatorIdx === 0
          ? input.amount
          : -input.amount
        : creatorIdx === 0
          ? -input.amount
          : input.amount;
    newBalance = (pairData.balance || 0) + balanceDelta;

    firestoreTransaction.set(txRef, {
      ...baseFields,
      status: "approved",
      createdAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
    });
    firestoreTransaction.update(pairRef, {
      balance: newBalance,
      updatedAt: serverTimestamp(),
    });
  });

  await writeBalanceSnapshot(pair.id, newBalance, "auto-approved", userId, {
    id: txRef.id,
    ...baseFields,
    status: "approved",
  } as Transaction);

  await sendTransactionEmail(pair.id, txRef.id);
  return { id: txRef.id, autoApproved: true };
}

export async function approveTransaction(
  pair: Pair,
  tx: Transaction,
  userId: string,
): Promise<void> {
  let newBalance = 0;

  await runTransaction(db, async (firestoreTransaction) => {
    const pairRef = doc(db, "pairs", pair.id);
    const txRef = doc(db, "pairs", pair.id, "transactions", tx.id);
    const [pairSnap, txSnap] = await Promise.all([
      firestoreTransaction.get(pairRef),
      firestoreTransaction.get(txRef),
    ]);
    if (!pairSnap.exists() || !txSnap.exists())
      throw new Error("Transaction not found");
    const currentTx = txSnap.data() as Transaction;
    if (currentTx.status !== "pending")
      throw new Error("This transaction has already been resolved");
    if (currentTx.createdBy === userId)
      throw new Error("Only your partner can approve this transaction");

    const pairData = pairSnap.data();
    if (currentTx.type === "settlement") {
      const requestedBalance = currentTx.balanceAtRequest;
      if (
        typeof requestedBalance !== "number" ||
        !Number.isFinite(requestedBalance) ||
        requestedBalance === 0 ||
        Math.abs(requestedBalance) !== currentTx.amount
      ) {
        throw new Error("This settlement request is invalid");
      }
      if ((pairData.balance || 0) !== requestedBalance) {
        throw new Error(
          "The balance changed after this settlement was requested. Send a new request.",
        );
      }
      newBalance = 0;
    } else {
      const creatorIdx = pairData.users.indexOf(currentTx.createdBy);
      let balanceDelta = 0;
      if (currentTx.type === "payment") {
        balanceDelta = creatorIdx === 0 ? currentTx.amount : -currentTx.amount;
      } else {
        balanceDelta = creatorIdx === 0 ? -currentTx.amount : currentTx.amount;
      }
      newBalance = (pairData.balance || 0) + balanceDelta;
    }

    firestoreTransaction.update(pairRef, {
      balance: newBalance,
      updatedAt: serverTimestamp(),
    });
    firestoreTransaction.update(txRef, {
      status: "approved",
      resolvedAt: serverTimestamp(),
    });
  });

  await writeBalanceSnapshot(
    pair.id,
    newBalance,
    tx.type === "settlement" ? "settlement approved" : "transaction approved",
    userId,
    tx,
  );
  await sendResolvedEmail(pair.id, tx.id);
}

/**
 * Create a settlement request without changing the current balance. The
 * partner must approve it before the balance is zeroed.
 */
export async function requestSettlement(
  pair: Pair,
  userId: string,
): Promise<void> {
  await runTransaction(db, async (firestoreTransaction) => {
    const pairRef = doc(db, "pairs", pair.id);
    const pairSnap = await firestoreTransaction.get(pairRef);
    if (!pairSnap.exists()) throw new Error("Pair not found");

    const pairData = pairSnap.data();
    if (pairData.status !== "active")
      throw new Error("This connection is no longer active");
    if (!pairData.users.includes(userId))
      throw new Error("You are not part of this connection");
    const balance = pairData.balance || 0;
    if (balance === 0) throw new Error("There is no balance to settle");

    const txRef = doc(collection(db, "pairs", pair.id, "transactions"));
    firestoreTransaction.set(txRef, {
      pairId: pair.id,
      amount: Math.abs(balance),
      type: "settlement",
      description: "Settlement requested",
      createdBy: userId,
      status: "pending",
      balanceAtRequest: balance,
      createdAt: serverTimestamp(),
    });
  });
}

/** Deny a settlement request without changing the pair balance. */
export async function denySettlement(
  pair: Pair,
  tx: Transaction,
  userId: string,
): Promise<void> {
  await runTransaction(db, async (firestoreTransaction) => {
    const txRef = doc(db, "pairs", pair.id, "transactions", tx.id);
    const txSnap = await firestoreTransaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found");
    const currentTx = txSnap.data() as Transaction;
    if (currentTx.type !== "settlement" || currentTx.status !== "pending") {
      throw new Error("This settlement request has already been resolved");
    }
    if (currentTx.createdBy === userId) {
      throw new Error("Only your partner can deny this settlement request");
    }

    firestoreTransaction.update(txRef, {
      status: "disputed",
      resolvedAt: serverTimestamp(),
    });
  });
  await sendResolvedEmail(pair.id, tx.id);
}

/** Decline a pending transaction without asking the user to write a dispute note. */
export async function declineTransaction(
  pair: Pair,
  tx: Transaction,
  userId: string,
): Promise<void> {
  if (tx.type === "settlement") {
    return denySettlement(pair, tx, userId);
  }

  await runTransaction(db, async (firestoreTransaction) => {
    const txRef = doc(db, "pairs", pair.id, "transactions", tx.id);
    const txSnap = await firestoreTransaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found");
    const currentTx = txSnap.data() as Transaction;
    if (currentTx.status !== "pending")
      throw new Error("This transaction has already been resolved");
    if (currentTx.createdBy === userId)
      throw new Error("Only your partner can decline this transaction");

    firestoreTransaction.update(txRef, {
      status: "disputed",
      disputeReason: "Declined",
      resolvedAt: serverTimestamp(),
    });
  });
  await sendResolvedEmail(pair.id, tx.id);
}

export async function disputeTransaction(
  pair: Pair,
  tx: Transaction,
  userId: string,
  reason: string,
  proposedAmount: number | undefined,
): Promise<void> {
  if (!reason.trim()) throw new Error("Provide a reason for the dispute");
  if (
    proposedAmount !== undefined &&
    (!Number.isFinite(proposedAmount) || proposedAmount <= 0)
  ) {
    throw new Error("Enter a valid counter-proposal amount");
  }
  await runTransaction(db, async (firestoreTransaction) => {
    const txRef = doc(db, "pairs", pair.id, "transactions", tx.id);
    const txSnap = await firestoreTransaction.get(txRef);
    if (!txSnap.exists()) throw new Error("Transaction not found");
    const currentTx = txSnap.data() as Transaction;
    if (currentTx.status !== "pending")
      throw new Error("This transaction has already been resolved");
    if (currentTx.type === "settlement")
      throw new Error("Settlement requests can only be approved or denied");
    if (currentTx.createdBy === userId)
      throw new Error("Only your partner can dispute this transaction");
    const update: Record<string, unknown> = {
      status: "disputed",
      disputeReason: reason.trim().slice(0, 500),
      resolvedAt: serverTimestamp(),
    };
    if (proposedAmount !== undefined) update.proposedAmount = proposedAmount;
    firestoreTransaction.update(txRef, update);
  });
  await sendResolvedEmail(pair.id, tx.id);
}

/**
 * Hard-delete a pending transaction that the current user created.
 * Only works on transactions with status === "pending".
 */
export async function cancelTransaction(
  pairId: string,
  txId: string,
): Promise<void> {
  await deleteDoc(doc(db, "pairs", pairId, "transactions", txId));
}

export async function setAutoApprove(
  pairId: string,
  enabled: boolean,
): Promise<void> {
  await updateDoc(doc(db, "pairs", pairId), {
    autoApprove: enabled,
    updatedAt: serverTimestamp(),
  });
}

export async function editTransaction(
  pairId: string,
  txId: string,
  updates: { amount: number; description: string; date: Timestamp },
): Promise<void> {
  await updateDoc(doc(db, "pairs", pairId, "transactions", txId), {
    amount: updates.amount,
    description: updates.description,
    date: updates.date,
  });
}

export async function acceptCounter(
  pair: Pair,
  tx: Transaction,
  userId: string,
): Promise<void> {
  if (
    typeof tx.proposedAmount !== "number" ||
    !Number.isFinite(tx.proposedAmount) ||
    tx.proposedAmount <= 0
  )
    throw new Error("This counter-proposal is no longer available");
  let newBalance = 0;

  await runTransaction(db, async (firestoreTransaction) => {
    const pairRef = doc(db, "pairs", pair.id);
    const txRef = doc(db, "pairs", pair.id, "transactions", tx.id);
    const [pairSnap, txSnap] = await Promise.all([
      firestoreTransaction.get(pairRef),
      firestoreTransaction.get(txRef),
    ]);
    if (!pairSnap.exists() || !txSnap.exists())
      throw new Error("Transaction not found");
    const currentTx = txSnap.data() as Transaction;
    if (
      currentTx.status !== "disputed" ||
      typeof currentTx.proposedAmount !== "number" ||
      !Number.isFinite(currentTx.proposedAmount) ||
      currentTx.proposedAmount <= 0
    ) {
      throw new Error("This counter-proposal is no longer available");
    }

    const pairData = pairSnap.data();
    const creatorIdx = pairData.users.indexOf(currentTx.createdBy);
    let balanceDelta = 0;
    if (currentTx.type === "payment") {
      balanceDelta =
        creatorIdx === 0 ? currentTx.proposedAmount : -currentTx.proposedAmount;
    } else {
      balanceDelta =
        creatorIdx === 0 ? -currentTx.proposedAmount : currentTx.proposedAmount;
    }
    newBalance = (pairData.balance || 0) + balanceDelta;

    firestoreTransaction.update(pairRef, {
      balance: newBalance,
      updatedAt: serverTimestamp(),
    });
    firestoreTransaction.update(txRef, {
      amount: currentTx.proposedAmount,
      status: "approved",
      resolvedAt: serverTimestamp(),
    });
  });

  await writeBalanceSnapshot(
    pair.id,
    newBalance,
    "counter-proposal accepted",
    userId,
    tx,
  );
}

export async function rejectCounter(
  pair: Pair,
  tx: Transaction,
): Promise<void> {
  await updateDoc(doc(db, "pairs", pair.id, "transactions", tx.id), {
    proposedAmount: null,
    status: "disputed",
  });
}

export async function archiveTransaction(
  pairId: string,
  txId: string,
): Promise<void> {
  await updateDoc(doc(db, "pairs", pairId, "transactions", txId), {
    archived: true,
    archivedAt: serverTimestamp(),
  });
}

export async function unarchiveTransaction(
  pairId: string,
  txId: string,
): Promise<void> {
  await updateDoc(doc(db, "pairs", pairId, "transactions", txId), {
    archived: false,
    archivedAt: deleteField(),
  });
}

export async function archiveResolvedForPair(
  pairId: string,
  transactions: Transaction[],
): Promise<number> {
  const candidates = transactions.filter(
    (t) => t.status === "approved" && t.archived !== true,
  );
  if (candidates.length === 0) return 0;

  const CHUNK = 450;
  for (let i = 0; i < candidates.length; i += CHUNK) {
    const slice = candidates.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const tx of slice) {
      batch.update(doc(db, "pairs", pairId, "transactions", tx.id), {
        archived: true,
        archivedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }

  return candidates.length;
}

export async function removeConnection(pair: Pair): Promise<void> {
  if (pair.status !== "active")
    throw new Error("This connection is no longer active");
  if (pair.balance !== 0)
    throw new Error("Settle the balance before removing this connection");

  await updateDoc(doc(db, "pairs", pair.id), {
    status: "removed",
    updatedAt: serverTimestamp(),
  });
}

/** Forgiveness reads the current balance inside the transaction so stale screens cannot over-forgive. */
export async function forgiveDebt(
  pair: Pair,
  userId: string,
  amount: number,
  reason: string,
): Promise<void> {
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    Math.abs(Math.round(amount * 100) - amount * 100) > 0.000001
  )
    throw new Error("Enter a positive amount with at most two decimal places.");
  const txRef = doc(collection(db, "pairs", pair.id, "transactions"));
  const snapshotRef = doc(collection(db, "pairs", pair.id, "balanceSnapshots"));
  await runTransaction(db, async (transaction) => {
    const ref = doc(db, "pairs", pair.id);
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error("Connection unavailable.");
    const current = snap.data() as Pair;
    const index = current.users.indexOf(userId);
    const owed = index === 0 ? current.balance : -current.balance;
    if (index < 0 || current.status !== "active" || owed <= 0 || amount > owed)
      throw new Error("You may only forgive an amount currently owed to you.");
    const balance =
      Math.round((current.balance + (index === 0 ? -amount : amount)) * 100) /
      100;
    transaction.update(ref, { balance, updatedAt: serverTimestamp() });
    transaction.set(txRef, {
      pairId: pair.id,
      amount,
      type: "forgiveness",
      description: reason.trim().slice(0, 200) || "Debt forgiven",
      createdBy: userId,
      status: "approved",
      createdAt: serverTimestamp(),
      resolvedAt: serverTimestamp(),
    });
    transaction.set(snapshotRef, {
      balance,
      timestamp: serverTimestamp(),
      effectiveAt: Timestamp.now(),
      transactionId: txRef.id,
      triggeredBy: userId,
      reason: "forgiven",
    });
  });
  await sendResolvedEmail(pair.id, txRef.id);
}
