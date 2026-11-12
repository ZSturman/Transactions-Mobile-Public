// Synthetic native UI fixtures only. This script refuses all remote databases.
const assert = require("node:assert/strict");
const http = require("node:http");
const admin = require("../../web/node_modules/firebase-admin");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8180");
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9199");
admin.initializeApp({ projectId: "demo-test" });
const db = admin.firestore();
const stamp = admin.firestore.Timestamp;
const now = Date.now();
async function seed() {
  for (const [uid, name, email] of [
    ["native-alice", "Alice", "alice@transactions.example.test"],
    ["native-alex", "Alex Morgan", "alex@example.test"],
    ["native-jordan", "Jordan Lee", "jordan@example.test"],
    ["native-taylor", "Taylor Reed", "taylor@example.test"],
    ["native-sam", "Sam Chen", "sam@example.test"],
  ]) {
    try {
      await admin
        .auth()
        .createUser({
          uid,
          displayName: name,
          email,
          password: "Fixture-only-password-123",
        });
    } catch (e) {
      if (
        e.code !== "auth/uid-already-exists" &&
        e.code !== "auth/email-already-exists"
      )
        throw e;
    }
    await db
      .doc(`users/${uid}`)
      .set({
        uid,
        email,
        displayName: name,
        photoURL: "",
        currency: "USD",
        notificationPreferences: {
          transactionEmails: true,
          activityEmails: true,
        },
        createdAt: stamp.now(),
      });
  }
  for (const [slug, name, total] of [
    ["alex", "Alex Morgan", 140],
    ["jordan", "Jordan Lee", -60],
    ["taylor", "Taylor Reed", 0],
  ]) {
    const pairId = `native-${slug}`;
    const partner = `native-${slug}`;
    const email = `${slug}@example.test`;
    await db
      .doc(`pairs/${pairId}`)
      .set({
        users: ["native-alice", partner],
        userEmails: ["alice@transactions.example.test", email],
        userNames: ["Alice", name],
        balance: total,
        currency: "USD",
        status: "active",
        autoApprove: false,
        createdAt: stamp.fromMillis(now - 29 * 86400000),
        updatedAt: stamp.now(),
      });
    let balance = 0;
    for (const [index, amount] of [
      20,
      35,
      -15,
      50,
      -10,
      total - 80,
    ].entries()) {
      if (!amount) continue;
      const date = stamp.fromMillis(now - (26 - index * 4) * 86400000);
      balance += amount;
      await db
        .doc(`pairs/${pairId}/transactions/history-${index}`)
        .set({
          pairId,
          amount: Math.abs(amount),
          type: amount > 0 ? "payment" : "request",
          description: [
            "Groceries",
            "Dinner together",
            "Lunch",
            "Weekend tickets",
            "Coffee",
            "Shared expenses",
          ][index],
          createdBy: "native-alice",
          status: "approved",
          date,
          createdAt: date,
          resolvedAt: date,
        });
    }
    if (slug === "alex")
      await db
        .doc(`pairs/${pairId}/transactions/review`)
        .set({
          pairId,
          amount: 24,
          type: "payment",
          description: "Friday dinner split",
          createdBy: partner,
          status: "pending",
          date: stamp.now(),
          createdAt: stamp.now(),
        });
  }
  await db
    .doc("pairs/native-invitation")
    .set({
      users: ["native-sam", ""],
      userEmails: ["sam@example.test", "alice@transactions.example.test"],
      userNames: ["Sam Chen", ""],
      balance: 0,
      currency: "USD",
      status: "pending",
      createdAt: stamp.now(),
      updatedAt: stamp.now(),
    });
  await db
    .doc("invites/native-invitation")
    .set({
      fromUid: "native-sam",
      fromEmail: "sam@example.test",
      fromName: "Sam Chen",
      toEmail: "alice@transactions.example.test",
      pairId: "native-invitation",
      status: "pending",
      createdAt: stamp.now(),
      expiresAt: stamp.fromMillis(now + 7 * 86400000),
    });
  console.log(
    "Native fixtures ready: alice@transactions.example.test / Fixture-only-password-123. Data is synthetic and emulator-only.",
  );
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        skipped: true,
        reason: "native_fixture_email_disabled",
      }),
    );
  });
  server.listen(4373, "127.0.0.1");
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
seed().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
