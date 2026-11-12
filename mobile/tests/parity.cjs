// Execute the actual mobile and web action modules against isolated emulators.
// Native Firebase initialization is replaced with authenticated emulator clients;
// email delivery is disabled. Never load .env or connect to production here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const ts = require('typescript');
const admin = require('../../web/node_modules/firebase-admin');
const mobileRoot = path.resolve(__dirname, '..');
const webRoot = path.resolve(__dirname, '../../web');
const projectId = 'demo-test';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8180', 'Start with npm run test:parity:emulators');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
admin.initializeApp({ projectId });
const fixtureDb = admin.firestore();
const runId = `mobile-parity-${Date.now()}`;
const apps = [];

function loadSource(root, relative, db, cache = new Map()) {
  const filename = path.join(root, 'src', relative + '.ts');
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} };
  cache.set(filename, module.exports);
  const originalRequire = createRequire(path.join(root, 'package.json'));
  function sourceRequire(specifier) {
    if (specifier === '../lib/firebase' || specifier === '@/lib/firebase') return { db };
    if (specifier === '@/lib/email' || specifier === '../lib/email') return { sendTransactionEmail: async () => ({ skipped: true }), sendResolvedEmail: async () => ({ skipped: true }), sendInviteEmail: async () => ({ skipped: true }) };
    if (specifier.startsWith('@/')) return loadSource(root, specifier.slice(2), db, cache);
    if (specifier.startsWith('.')) {
      const resolved = path.relative(path.join(root, 'src'), path.resolve(path.dirname(filename), specifier));
      return loadSource(root, resolved, db, cache);
    }
    return originalRequire(specifier);
  }
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename })(sourceRequire, module, module.exports);
  cache.set(filename, module.exports);
  return module.exports;
}

async function client(root, name) {
  const req = createRequire(path.join(root, 'package.json'));
  const firebase = req('firebase/app');
  const authSdk = req('firebase/auth');
  const firestore = req('firebase/firestore');
  const app = firebase.initializeApp({ projectId, apiKey: 'demo-api-key', appId: `demo-${name}` }, `${runId}-${name}`);
  apps.push({ app, firebase });
  const auth = authSdk.getAuth(app);
  authSdk.connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const { user } = await authSdk.createUserWithEmailAndPassword(auth, `${runId}-${name}@example.test`, 'fixture-only-password');
  const db = firestore.getFirestore(app);
  firestore.connectFirestoreEmulator(db, '127.0.0.1', 8180);
  return { user, db, fs: firestore, actions: loadSource(root, 'utils/transactionActions', db), ui: loadSource(root, 'utils/transactionPresentation', db) };
}

async function main() {
  const a = await client(mobileRoot, 'alice');
  const b = await client(webRoot, 'bob');
  const ref = fixtureDb.doc(`pairs/${runId}`);
  await ref.set({ users: [a.user.uid, b.user.uid], userEmails: [a.user.email, b.user.email], userNames: ['Alice', 'Bob'], currency: 'USD', balance: 0, status: 'active', createdAt: admin.firestore.Timestamp.now(), updatedAt: admin.firestore.Timestamp.now() });
  const pair = async () => ({ id: runId, ...(await ref.get()).data() });
  const tx = async (id) => ({ id, ...(await ref.collection('transactions').doc(id).get()).data() });
  const input = (type, amount, client) => ({ type, amount, description: 'Isolated parity fixture', date: client.fs.Timestamp.fromDate(new Date('2026-10-01T12:00:00Z')) });
  for (const direction of ['i_paid', 'they_paid']) {
    for (const share of [0, 20, 50, 80, 100]) {
      assert.equal(a.ui.splitDebtAmount(500, share, direction), b.ui.splitDebtAmount(500, share, direction));
    }
  }
  assert.equal(a.ui.splitDebtAmount(500, 20, 'i_paid'), 400);
  assert.equal(a.ui.splitDebtAmount(500, 20, 'they_paid'), 100);
  console.log('PASS: mobile/web split calculations and both directions');

  const split = a.ui.splitDetailsFor(500, 20, 'i_paid');
  const created = await a.actions.createTransaction(await pair(), a.user.uid, { ...input('payment', 400, a), split });
  assert.equal((await pair()).balance, 0);
  const webSeen = (await b.fs.getDoc(b.fs.doc(b.db, 'pairs', runId, 'transactions', created.id))).data();
  assert.equal(webSeen.amount, 400);
  assert.deepEqual(webSeen.split, { totalAmount: 500, creatorSharePercent: 20, paidBy: 'creator' });
  assert.equal(b.ui.obligationText({ ...webSeen, id: created.id }, await pair(), b.user.uid), 'You owe Alice');
  await assert.rejects(a.actions.approveTransaction(await pair(), await tx(created.id), a.user.uid), /Only your partner/);
  await b.actions.approveTransaction(await pair(), await tx(created.id), b.user.uid);
  assert.equal((await pair()).balance, 400);
  await assert.rejects(a.actions.approveTransaction(await pair(), await tx(created.id), a.user.uid), /already been resolved/);
  console.log('PASS: native split visible to web, partner approval once, creator blocked');

  const reverse = await b.actions.createTransaction(await pair(), b.user.uid, input('payment', 30, b));
  await a.actions.approveTransaction(await pair(), await tx(reverse.id), a.user.uid);
  assert.equal((await pair()).balance, 370);
  const owed = await a.actions.createTransaction(await pair(), a.user.uid, input('request', 20, a));
  await b.actions.approveTransaction(await pair(), await tx(owed.id), b.user.uid);
  assert.equal((await pair()).balance, 350);
  console.log('PASS: web-to-native approval and opposite debt direction');

  const disputed = await b.actions.createTransaction(await pair(), b.user.uid, input('payment', 12, b));
  await a.actions.disputeTransaction(await pair(), await tx(disputed.id), a.user.uid, 'Wrong amount');
  assert.equal((await tx(disputed.id)).status, 'disputed');
  assert.equal((await pair()).balance, 350);
  const cancelled = await a.actions.createTransaction(await pair(), a.user.uid, input('payment', 10, a));
  await a.actions.cancelTransaction(runId, cancelled.id);
  assert.equal((await ref.collection('transactions').doc(cancelled.id).get()).exists, false);
  console.log('PASS: native dispute and cancellation preserve balance');

  await ref.update({ autoApprove: true });
  for (const [client, type, amount, expected] of [[a, 'payment', 10, 360], [a, 'request', 5, 355], [b, 'payment', 10, 345], [b, 'request', 5, 350]]) {
    const result = await client.actions.createTransaction(await pair(), client.user.uid, input(type, amount, client));
    assert.equal(result.autoApproved, true);
    assert.equal((await tx(result.id)).status, 'approved');
    assert.equal((await pair()).balance, expected);
  }
  console.log('PASS: auto-approve for both clients and debt directions');

  await a.actions.requestSettlement(await pair(), a.user.uid);
  const settlement = (await ref.collection('transactions').where('type', '==', 'settlement').where('status', '==', 'pending').get()).docs[0];
  assert.equal((await pair()).balance, 350);
  await b.actions.approveTransaction(await pair(), await tx(settlement.id), b.user.uid);
  assert.equal((await pair()).balance, 0);
  await assert.rejects(a.actions.requestSettlement(await pair(), a.user.uid), /no balance/);
  console.log('PASS: native settlement request waits for web approval');

  await ref.update({ balance: 100 });
  await b.actions.requestSettlement(await pair(), b.user.uid);
  const stale = (await ref.collection('transactions').where('type', '==', 'settlement').where('status', '==', 'pending').get()).docs[0];
  await ref.update({ balance: 120 });
  await assert.rejects(a.actions.approveTransaction(await pair(), await tx(stale.id), a.user.uid), /balance changed/);
  await a.actions.denySettlement(await pair(), await tx(stale.id), a.user.uid);
  assert.equal((await pair()).balance, 120);
  assert.equal((await tx(stale.id)).status, 'disputed');
  console.log('PASS: native stale-settlement guard and denial preserve balance');

  const snapshots = await ref.collection('balanceSnapshots').get();
  assert(snapshots.docs.some(d => d.data().effectiveAt?.toDate().toISOString() === '2026-10-01T12:00:00.000Z'));
  console.log('PASS: balance history preserves transaction event date');
  await ref.update({ autoApprove: false });
  const editable = await a.actions.createTransaction(await pair(), a.user.uid, input('payment', 20, a));
  await a.actions.editTransaction(runId, editable.id, { amount: 25, description: 'Edited fixture', date: input('payment', 1, a).date });
  await assert.rejects(b.actions.editTransaction(runId, editable.id, { amount: 99, description: 'Not mine', date: input('payment', 1, b).date }));
  await b.actions.disputeTransaction(await pair(), await tx(editable.id), b.user.uid, 'Counter', 15);
  await a.actions.acceptCounter(await pair(), await tx(editable.id), a.user.uid);
  assert.equal((await pair()).balance, 135);
  assert.equal((await tx(editable.id)).amount, 15);
  await assert.rejects(a.actions.acceptCounter(await pair(), await tx(editable.id), a.user.uid), /no longer/);
  console.log('PASS: edit ownership, counter-proposal and exactly-once acceptance');
  await a.actions.archiveTransaction(runId, editable.id);
  assert.equal((await tx(editable.id)).archived, true);
  await b.actions.unarchiveTransaction(runId, editable.id);
  assert.equal((await tx(editable.id)).archived, false);
  assert.equal((await pair()).balance, 135);
  await assert.rejects(a.actions.removeConnection(await pair()), /Settle/);
  await assert.rejects(a.actions.forgiveDebt(await pair(), b.user.uid, 10, 'Not owed'), /only forgive/);
  await assert.rejects(a.actions.forgiveDebt(await pair(), a.user.uid, 136, 'Too much'), /only forgive/);
  await a.actions.forgiveDebt(await pair(), a.user.uid, 35, 'Fixture forgiveness');
  assert.equal((await pair()).balance, 100);
  console.log('PASS: archive/restore preserve balances and forgiveness rejects stale/invalid amounts');
  const importer = loadSource(mobileRoot, 'utils/importTransactions', a.db);
  const parser = loadSource(mobileRoot, 'utils/csvImport', a.db);
  const mapping = { Amount: 'amount', Type: 'type', Date: 'date', Description: 'description' };
  const rows = importer.validateRows([{ Amount: '2', Type: 'payment', Date: '2026-10-01', Description: 'Import fixture' }, { Amount: '2', Type: 'payment', Date: '2026-10-01', Description: 'Import fixture' }, { Amount: 'oops', Type: 'payment' }], mapping, []);
  assert.equal(rows[1].duplicate, true); assert(rows[2].errors.length);
  const imported = await importer.importTransactions(await pair(), a.user.uid, rows, () => {});
  assert.equal(imported.imported, 1);
  const repeated = await importer.importTransactions(await pair(), a.user.uid, rows, () => {});
  assert.equal(repeated.imported, 0); assert.equal(repeated.duplicates, 1);
  assert.equal((await pair()).balance, 100);
  console.log('PASS: CSV validation, duplicates and retry do not change confirmed balances');
  const mobileHistory = loadSource(mobileRoot, 'utils/balanceHistory', a.db);
  const webHistory = loadSource(webRoot, 'utils/balanceHistory', b.db);
  const mobileActivity = loadSource(mobileRoot, 'utils/activity', a.db);
  const webActivity = loadSource(webRoot, 'utils/activity', b.db);
  const allRecords = (await ref.collection('transactions').get()).docs.map(d => ({ id: d.id, ...d.data() }));
  for (const viewer of [a.user.uid,b.user.uid]) assert.deepEqual(mobileHistory.buildPairBalanceHistory(allRecords, await pair(), viewer), webHistory.buildPairBalanceHistory(allRecords, await pair(), viewer));
  for (const period of ['7D','30D','90D','1Y','all']) assert.deepEqual(mobileActivity.buildActivity(allRecords, period), webActivity.buildActivity(allRecords, period));
  assert.deepEqual(mobileHistory.buildPairBalanceHistory([], await pair(), a.user.uid), []);
  console.log('PASS: native/web chart calculations match both perspectives, periods and empty history');
  const invites = loadSource(mobileRoot, 'utils/inviteActions', a.db);
  const charlie = await client(mobileRoot, 'charlie');
  const sentInvite = await invites.createInvite(a.user, 'Alice', charlie.user.email, 'USD', []);
  const inviteRef = fixtureDb.doc(`invites/${sentInvite.inviteId}`);
  const invitation = { id: sentInvite.inviteId, ...(await inviteRef.get()).data() };
  await assert.rejects(invites.acceptInviteForUser(invitation, b.user), /different email/);
  const recipientInvites = loadSource(mobileRoot, 'utils/inviteActions', charlie.db);
  await recipientInvites.acceptInviteForUser(invitation, charlie.user);
  assert.equal((await fixtureDb.doc(`pairs/${sentInvite.pairId}`).get()).data().status,'active');
  await assert.rejects(invites.cancelInviteForUser(invitation,a.user), /already been/);
  await fixtureDb.recursiveDelete(fixtureDb.doc(`pairs/${sentInvite.pairId}`)); await inviteRef.delete();
  const cancel = await invites.createInvite(a.user, 'Alice', 'unused@example.test', 'USD', []);
  const cancelDoc = fixtureDb.doc(`invites/${cancel.inviteId}`);
  await invites.cancelInviteForUser({id:cancel.inviteId,...(await cancelDoc.get()).data()},a.user);
  assert.equal((await cancelDoc.get()).exists,false);
  console.log('PASS: invitations, recipient ownership, acceptance and atomic cancellation');
  const deletion = loadSource(webRoot, 'lib/account-deletion', fixtureDb);
  const realAuth = admin.auth();
  const appleAuth = { getUser: async uid => ({ ...(await realAuth.getUser(uid)), providerData: [{ providerId: 'apple.com', uid: 'fixture-apple-subject' }] }) };
  await assert.rejects(deletion.deleteAccountData(fixtureDb, appleAuth, b.user.uid, { appleCode: 'fixture-code', revokeApple: async () => { throw new Error('Fixture Apple outage'); } }), /Apple outage/);
  assert.equal((await fixtureDb.doc(`accountDeletionJobs/${b.user.uid}`).get()).exists, false);
  assert.equal((await pair()).status, 'active');
  console.log('PASS: failed Apple revocation leaves the account and shared data unchanged');
  assert.throws(() => deletion.requireRecentAuthentication({ auth_time: 1 }), /Sign in again/);
  deletion.requireRecentAuthentication({ auth_time: Math.floor(Date.now()/1000) });
  await fixtureDb.doc(`users/${a.user.uid}`).set({ email: a.user.email, displayName: 'Alice' });
  await fixtureDb.doc(`notificationDeliveries/${runId}`).set({ toEmail: a.user.email });
  await fixtureDb.doc(`accountDeletionJobs/${a.user.uid}`).set({ replacement: `deleted_${runId}`, startedAt: admin.firestore.Timestamp.now() });
  await assert.rejects(a.actions.createTransaction(await pair(), a.user.uid, input('payment', 1, a)));
  await assert.rejects(b.actions.createTransaction(await pair(), b.user.uid, input('payment', 1, b)));
  await deletion.deleteAccountData(fixtureDb, admin.auth(), a.user.uid);
  assert.equal((await fixtureDb.doc(`users/${a.user.uid}`).get()).exists,false);
  assert.equal((await fixtureDb.doc(`accountDeletionJobs/${a.user.uid}`).get()).data().completed,true);
  const anonymized = await pair();
  assert.equal(anonymized.userEmails[0], ''); assert.equal(anonymized.userNames[0], 'Deleted user');
  assert.equal(anonymized.status, 'removed'); assert.equal(anonymized.balance, 100);
  await assert.rejects(admin.auth().getUser(a.user.uid), /no user record/i);
  await deletion.deleteAccountData(fixtureDb, admin.auth(), a.user.uid);
  await assert.rejects(a.fs.setDoc(a.fs.doc(a.db,'users',a.user.uid),{email:a.user.email}));
  assert.equal((await pair()).balance,100);
  console.log('PASS: recent authentication, deletion write locks, anonymization, preserved obligations and retry');
  assert.equal(await deletion.cleanupDeletedAccounts(fixtureDb), 0);
  assert.equal(await deletion.cleanupDeletedAccounts(fixtureDb, Date.now() + 3*60*60*1000), 1);
  await fixtureDb.recursiveDelete(ref);
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await Promise.all(apps.map(({ app, firebase }) => firebase.deleteApp(app)));
  await admin.app().delete();
});
