import {
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  runTransaction,
  getDocs,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { db } from "../lib/firebase";
import { sendInviteEmail } from "../lib/email";
import { Pair, Invite } from "../types";

export async function createInvite(
  user: User,
  name: string,
  email: string,
  currency: string,
  pairs: Pair[],
) {
  const toEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail))
    throw new Error("Enter a valid email address.");
  if (!user.email || toEmail === user.email.toLowerCase())
    throw new Error("You can't invite yourself.");
  if (
    pairs.some(
      (p) =>
        p.status !== "removed" &&
        p.userEmails.some((e) => e.toLowerCase() === toEmail),
    )
  )
    throw new Error(
      "A connection or invitation already exists for this person.",
    );
  const pair = doc(collection(db, "pairs"));
  const invite = doc(collection(db, "invites"));
  const batch = writeBatch(db);
  batch.set(pair, {
    users: [user.uid, ""],
    userEmails: [user.email.toLowerCase(), toEmail],
    userNames: [name || user.email, ""],
    balance: 0,
    currency,
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(invite, {
    fromUid: user.uid,
    fromEmail: user.email.toLowerCase(),
    fromName: name || user.email,
    toEmail,
    pairId: pair.id,
    status: "pending",
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
  });
  await batch.commit();
  const delivery = await sendInviteEmail(invite.id);
  return { pairId: pair.id, inviteId: invite.id, delivery };
}

export async function acceptInviteForUser(invite: Invite, user: User) {
  if (!user?.email) throw new Error("Sign in to accept this invitation");
  const email = user.email.toLowerCase();
  if (invite.toEmail.toLowerCase() !== email) {
    throw new Error("This invitation was sent to a different email address");
  }

  await runTransaction(db, async (transaction) => {
    const inviteRef = doc(db, "invites", invite.id);
    const pairRef = doc(db, "pairs", invite.pairId);
    const [inviteSnap, pairSnap] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(pairRef),
    ]);
    if (!inviteSnap.exists() || !pairSnap.exists())
      throw new Error("This invitation is no longer available");

    const currentInvite = inviteSnap.data() as Omit<Invite, "id">;
    if (currentInvite.status !== "pending")
      throw new Error("This invitation has already been used");
    if (
      Boolean(
        currentInvite.expiresAt?.toMillis &&
          currentInvite.expiresAt.toMillis() <= Date.now(),
      )
    )
      throw new Error(
        "This invitation has expired. Ask the sender for a new one.",
      );
    if (currentInvite.toEmail.toLowerCase() !== email)
      throw new Error("This invitation was sent to a different email address");

    const pair = pairSnap.data();
    if (pair.status !== "pending" || pair.users[1])
      throw new Error("This invitation is no longer available");
    const users = [...pair.users] as [string, string];
    const userEmails = [...pair.userEmails] as [string, string];
    const userNames = [...pair.userNames] as [string, string];
    users[1] = user.uid;
    userEmails[1] = email;
    userNames[1] = user.displayName || email;

    transaction.update(pairRef, {
      users,
      userEmails,
      userNames,
      status: "active",
      updatedAt: serverTimestamp(),
    });
    transaction.update(inviteRef, {
      status: "accepted",
      acceptedBy: user.uid,
      acceptedAt: serverTimestamp(),
    });

    if (currentInvite.pendingTransaction) {
      const txRef = doc(collection(db, "pairs", invite.pairId, "transactions"));
      const { amount, type, description, date, split } =
        currentInvite.pendingTransaction;
      transaction.set(txRef, {
        pairId: invite.pairId,
        amount,
        type,
        description,
        createdBy: currentInvite.fromUid,
        status: "pending",
        date: Timestamp.fromDate(new Date(`${date}T12:00:00`)),
        createdAt: serverTimestamp(),
        ...(split && { split }),
      });
    }
  });
}

export async function cancelInviteForUser(invite: Invite, user: User) {
  if (invite.fromUid !== user.uid)
    throw new Error("Only the sender can cancel an invitation.");
  const queued = await getDocs(
    collection(db, "pairs", invite.pairId, "transactions"),
  );
  if (queued.size > 400)
    throw new Error(
      "This invitation has too many queued requests to cancel at once. Contact support.",
    );
  await runTransaction(db, async (tx) => {
    const pairRef = doc(db, "pairs", invite.pairId);
    const inviteRef = doc(db, "invites", invite.id);
    const [pairSnap, inviteSnap] = await Promise.all([
      tx.get(pairRef),
      tx.get(inviteRef),
    ]);
    if (!pairSnap.exists() || !inviteSnap.exists())
      throw new Error("Invitation unavailable.");
    if (
      pairSnap.data().status !== "pending" ||
      inviteSnap.data().status !== "pending" ||
      inviteSnap.data().fromUid !== user.uid
    )
      throw new Error(
        "This invitation has already been accepted or cancelled.",
      );
    queued.docs.forEach((item) => tx.delete(item.ref));
    tx.delete(inviteRef);
    tx.delete(pairRef);
  });
}
