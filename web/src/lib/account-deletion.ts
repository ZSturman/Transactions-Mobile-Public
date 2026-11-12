import { randomUUID, sign } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import type { Auth, DecodedIdToken } from "firebase-admin/auth";

export class DeletionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireRecentAuthentication(
  token: Pick<DecodedIdToken, "auth_time">,
  now = Date.now(),
) {
  if (
    !Number.isFinite(token.auth_time) ||
    token.auth_time * 1000 < now - 5 * 60 * 1000 ||
    token.auth_time * 1000 > now + 60 * 1000
  ) {
    throw new DeletionError(
      "Sign in again immediately before deleting your account.",
      401,
    );
  }
}

/** Codes are sent only to Apple. No authorization codes or tokens are logged. */
export async function revokeAppleGrant(code: string, expectedSubject: string) {
  const clientId =
    process.env.APPLE_CLIENT_ID || "com.zacharysturman.transactions";
  const team = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const key = process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!team || !keyId || !key)
    throw new DeletionError(
      "Apple account deletion is not configured. Please contact support.",
      503,
    );
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "ES256", kid: keyId })}.${encode({ iss: team, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  const clientSecret = `${unsigned}.${signature}`;
  const response = await fetch("https://appleid.apple.com/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new DeletionError(
      "Apple could not verify this request. Sign in with Apple again and retry.",
      401,
    );
  const result = (await response.json()) as {
    refresh_token?: string;
    id_token?: string;
  };
  // This ID token comes directly from Apple's authenticated HTTPS token endpoint.
  const identity = JSON.parse(
    Buffer.from(result.id_token?.split(".")[1] || "", "base64url").toString(),
  ) as { sub?: string; aud?: string; iss?: string };
  if (
    identity.sub !== expectedSubject ||
    identity.aud !== clientId ||
    identity.iss !== "https://appleid.apple.com" ||
    !result.refresh_token
  ) {
    throw new DeletionError(
      "Use the Apple account linked to your Transactions account.",
      401,
    );
  }
  const revoked = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: result.refresh_token,
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!revoked.ok)
    throw new DeletionError(
      "Apple access could not be revoked. Please retry.",
      503,
    );
}

/**
 * Server-only resumable deletion. A pseudonymous job records progress and is
 * expires after success. Shared obligations retain amounts, not contact details.
 */
export async function deleteAccountData(
  db: Firestore,
  auth: Auth,
  uid: string,
  options: {
    appleCode?: string;
    appleAccessToken?: string;
    firebaseToken?: string;
    revokeApple?: typeof revokeAppleGrant;
  } = {},
) {
  const job = db.collection("accountDeletionJobs").doc(uid);
  let user;
  try {
    user = await auth.getUser(uid);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found")
      throw error;
    const receipt = await job.get();
    if (receipt.exists && !receipt.data()?.completed) {
      await job.set({
        completed: true,
        completedAt: FieldValue.serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
      });
    }
    return; // Keep a completed receipt until cleanup; stale tokens must stay locked out.
  }
  const previous = (await job.get()).data();
  const apple = user.providerData.find(
    (provider) => provider.providerId === "apple.com",
  );
  if (apple && !previous?.appleRevoked) {
    if (options.appleAccessToken && options.firebaseToken) {
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey)
        throw new DeletionError(
          "Apple account deletion is not configured.",
          503,
        );
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerId: "apple.com",
            tokenType: "ACCESS_TOKEN",
            token: options.appleAccessToken,
            idToken: options.firebaseToken,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new DeletionError(
          "Verify your Apple account again before deletion.",
          401,
        );
    } else {
      if (!options.appleCode)
        throw new DeletionError(
          "Verify your linked Apple account before deletion.",
          401,
        );
      await (options.revokeApple || revokeAppleGrant)(
        options.appleCode,
        apple.uid,
      );
    }
  }
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(job);
    if (!existing.exists)
      tx.create(job, {
        replacement: `deleted_${randomUUID()}`,
        startedAt: FieldValue.serverTimestamp(),
        appleRevoked: Boolean(apple),
      });
    else if (apple) tx.update(job, { appleRevoked: true });
  });
  const state = (await job.get()).data()!;
  const replacement = state.replacement as string;
  const invitations = new Map<
    string,
    FirebaseFirestore.QueryDocumentSnapshot
  >();
  const sent = await db.collection("invites").where("fromUid", "==", uid).get();
  sent.docs.forEach((d) => invitations.set(d.id, d));
  if (user.email) {
    const received = await db
      .collection("invites")
      .where("toEmail", "==", user.email.toLowerCase())
      .get();
    received.docs.forEach((d) => invitations.set(d.id, d));
  }
  for (const invitation of invitations.values()) {
    const pair = db.collection("pairs").doc(invitation.data().pairId);
    const current = await pair.get();
    if (current.exists && current.data()?.status === "pending")
      await db.recursiveDelete(pair);
    await invitation.ref.delete();
  }
  const pairs = await db
    .collection("pairs")
    .where("users", "array-contains", uid)
    .get();
  for (const pair of pairs.docs) {
    // An interrupted run leaves this pair discoverable until all its children
    // have been sanitized. These updates are safe to repeat.
    const pairValue = pair.data();
    const ownIndex = pairValue.users.indexOf(uid);
    const identifiers = [
      user.email,
      user.displayName,
      pairValue.userNames[ownIndex],
    ].filter((v): v is string => typeof v === "string" && v.length > 0);
    const redact = (text: unknown) =>
      identifiers.reduce(
        (value, identifier) => value.split(identifier).join("Deleted user"),
        typeof text === "string" ? text : "",
      );
    const transactions = await pair.ref.collection("transactions").get();
    const snapshots = await pair.ref.collection("balanceSnapshots").get();
    const writes: Array<{
      ref: FirebaseFirestore.DocumentReference;
      data: Record<string, unknown>;
    }> = [];
    for (const tx of transactions.docs) {
      const value = tx.data();
      writes.push({
        ref: tx.ref,
        data: {
          description: value.createdBy === uid ? "" : redact(value.description),
          disputeReason: FieldValue.delete(),
          importFingerprint: FieldValue.delete(),
          importBatchId: FieldValue.delete(),
          ...(value.createdBy === uid ? { createdBy: replacement } : {}),
        },
      });
    }
    for (const snap of snapshots.docs)
      writes.push({
        ref: snap.ref,
        data: {
          reason: "Account deleted",
          ...(snap.data().triggeredBy === uid
            ? { triggeredBy: replacement }
            : {}),
        },
      });
    for (let offset = 0; offset < writes.length; offset += 400) {
      const batch = db.batch();
      writes
        .slice(offset, offset + 400)
        .forEach((write) => batch.update(write.ref, write.data));
      await batch.commit();
    }
    await db.runTransaction(async (tx) => {
      const current = await tx.get(pair.ref);
      if (!current.exists) return;
      const data = current.data()!;
      const index = (data.users as string[]).indexOf(uid);
      if (index < 0) return;
      const users = [...data.users];
      const names = [...data.userNames];
      const emails = [...data.userEmails];
      users[index] = replacement;
      names[index] = "Deleted user";
      emails[index] = "";
      // Remove old soft-deletion maps containing the original account ID.
      tx.update(pair.ref, {
        users,
        userNames: names,
        userEmails: emails,
        deletedUsers: FieldValue.delete(),
        status: "removed",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }
  if (user.email) {
    const deliveries = await db
      .collection("notificationDeliveries")
      .where("toEmail", "==", user.email.toLowerCase())
      .get();
    for (const delivery of deliveries.docs) await delivery.ref.delete();
  }
  await db.recursiveDelete(db.collection("users").doc(uid));
  await auth.revokeRefreshTokens(uid);
  await auth.deleteUser(uid);
  await job.set({
    completed: true,
    completedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 2 * 60 * 60 * 1000),
  });
}

/** Remove only completed, expired receipts, after all old Firebase ID tokens expire. */
export async function cleanupDeletedAccounts(db: Firestore, now = Date.now()) {
  let removed = 0;
  for (let page = 0; page < 5; page++) {
    const receipts = await db
      .collection("accountDeletionJobs")
      .where("expiresAt", "<=", Timestamp.fromMillis(now))
      .limit(200)
      .get();
    if (receipts.empty) break;
    const batch = db.batch();
    for (const receipt of receipts.docs)
      if (receipt.data().completed === true) {
        batch.delete(receipt.ref);
        removed++;
      }
    await batch.commit();
    if (receipts.size < 200) break;
  }
  return removed;
}
