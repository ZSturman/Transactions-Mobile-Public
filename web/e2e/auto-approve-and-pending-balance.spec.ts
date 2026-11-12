import { expect, test } from "@playwright/test";
import {
  captureEmailCalls,
  clearAllEmulatorData,
  createAuthUser,
  createPair,
  createUserProfile,
  getFirestoreDocument,
  listFirestoreDocuments,
  loginViaUI,
} from "./helpers";

const alice = { email: "alice@auto-approve.test", password: "password123" };
const bob = { email: "bob@auto-approve.test", password: "password123" };

async function setupPair(pairId: string, autoApprove = false) {
  const [userA, userB] = await Promise.all([
    createAuthUser(alice.email, alice.password),
    createAuthUser(bob.email, bob.password),
  ]);
  await Promise.all([
    createUserProfile({ uid: userA.uid, email: userA.email, displayName: "Alice" }),
    createUserProfile({ uid: userB.uid, email: userB.email, displayName: "Bob" }),
  ]);

  await createPair({
    id: pairId,
    user1Id: userA.uid,
    user1Email: userA.email,
    user1Name: "Alice",
    user2Id: userB.uid,
    user2Email: userB.email,
    user2Name: "Bob",
    status: "active",
    autoApprove,
  });

  return { userA, userB, pairId };
}

async function pairData(pairId: string) {
  const pair = await getFirestoreDocument(`pairs/${pairId}`);
  if (!pair) throw new Error(`Pair ${pairId} was not found`);
  return pair;
}

test.describe("Auto-approved contacts", () => {
  test.beforeEach(async () => {
    await clearAllEmulatorData();
  });

  test("toggling auto-approve on a contact is easy to flip and persists", async ({ page }) => {
    const { pairId } = await setupPair("aa-toggle");
    await loginViaUI(page, alice);
    await page.goto(`/pair/${pairId}`);

    const toggle = page.getByRole("switch", { name: "Auto-approve transactions" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await expect(
      page.getByText("Transactions with Bob will now be applied automatically")
    ).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect((await pairData(pairId)).autoApprove).toBe(true);

    await toggle.click();
    await expect(page.getByText("Auto-approve turned off")).toBeVisible();
    expect((await pairData(pairId)).autoApprove).toBe(false);
  });

  test("applies a new transaction immediately without requiring the partner's approval", async ({
    page,
    browser,
  }) => {
    const { pairId } = await setupPair("aa-apply", true);
    captureEmailCalls(page);
    await loginViaUI(page, alice);
    await page.goto(`/pair/${pairId}`);

    await expect(
      page.getByRole("switch", { name: "Auto-approve transactions" })
    ).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "+ Transaction" }).click();
    await page.getByPlaceholder("0.00").fill("75");
    await page.getByRole("button", { name: "Record Transaction" }).click();
    await expect(
      page.getByText("Transaction recorded and auto-approved — balance updated!")
    ).toBeVisible({ timeout: 8_000 });

    // Written straight to "approved" — no pending review step for either side.
    const [created] = await listFirestoreDocuments(`pairs/${pairId}/transactions`);
    expect(created?.data).toMatchObject({ amount: 75, type: "payment", status: "approved" });
    expect((await pairData(pairId)).balance).toBe(75);

    await expect(page.getByTestId("current-balance")).toHaveText("+$75.00");
    await expect(page.getByText(/\d+ pending/)).toHaveCount(0);

    // Bob never sees an approval request for it either.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginViaUI(pageB, bob);
    await pageB.goto("/");
    await expect(pageB.getByText("Needs Your Attention")).toHaveCount(0);
    await pageB.goto(`/pair/${pairId}`);
    await expect(pageB.getByTestId("current-balance")).toHaveText("$75.00");
    await expect(pageB.getByText(/\d+ pending/)).toHaveCount(0);
    await ctxB.close();
  });
});

test.describe("Pending balance breakdown", () => {
  test.beforeEach(async () => {
    await clearAllEmulatorData();
  });

  test("shows current vs. pending vs. including-pending, and stays correct through edit, approval, and cancellation", async ({
    page,
    browser,
  }) => {
    const { pairId } = await setupPair("pb-lifecycle");
    await loginViaUI(page, alice);
    await page.goto(`/pair/${pairId}`);

    // No pending activity yet — only the confirmed balance is shown.
    await expect(page.getByTestId("pending-summary")).toHaveCount(0);

    // Alice records a pending payment: Bob owes her $30.
    await page.getByRole("button", { name: "+ Transaction" }).click();
    await page.getByPlaceholder("0.00").fill("30");
    await page.getByRole("button", { name: "Record Transaction" }).click();
    await expect(page.getByText("Transaction recorded — waiting for approval")).toBeVisible({
      timeout: 8_000,
    });

    // Current balance is still $0 — only the pending projection reflects it.
    await expect(page.getByTestId("current-balance")).toHaveText("$0.00");
    await expect(page.getByTestId("pending-in")).toHaveText("+$30.00");
    await expect(page.getByTestId("balance-including-pending")).toHaveText("+$30.00");

    // Editing the pending transaction updates the pending amounts.
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByLabel("Edit amount").fill("50");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Transaction updated")).toBeVisible();
    await expect(page.getByTestId("pending-in")).toHaveText("+$50.00");
    await expect(page.getByTestId("balance-including-pending")).toHaveText("+$50.00");
    expect((await listFirestoreDocuments(`pairs/${pairId}/transactions`))[0]?.data).toMatchObject({
      amount: 50,
      status: "pending",
    });
    // Editing a pending transaction never touches the confirmed balance.
    expect((await pairData(pairId)).balance).toBe(0);

    // Bob sees the same projection from his side of the balance.
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginViaUI(pageB, bob);
    await pageB.goto(`/pair/${pairId}`);
    await expect(pageB.getByTestId("pending-out")).toHaveText("-$50.00");
    await expect(pageB.getByTestId("balance-including-pending")).toHaveText("$50.00");

    // Bob approves it — the confirmed balance updates and the pending section clears.
    await pageB.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(pageB.getByText("Transaction approved — balance updated!")).toBeVisible({
      timeout: 8_000,
    });
    await expect(pageB.getByTestId("current-balance")).toHaveText("$50.00");
    await expect(pageB.getByTestId("pending-summary")).toHaveCount(0);
    expect((await pairData(pairId)).balance).toBe(50);

    // A second pending request from Alice, then cancelled, leaves no trace on the balance.
    await page.getByRole("button", { name: "+ Transaction" }).click();
    await page.getByPlaceholder("0.00").fill("20");
    await page.getByRole("button", { name: "Record Transaction" }).click();
    await expect(page.getByText("Transaction recorded — waiting for approval")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("pending-in")).toHaveText("+$20.00");

    await page.getByRole("button", { name: "Cancel request" }).click();
    await expect(page.getByText("Request cancelled")).toBeVisible();
    await expect(page.getByTestId("pending-summary")).toHaveCount(0);
    expect((await pairData(pairId)).balance).toBe(50);

    await ctxB.close();
  });

  test("clears the pending projection when the partner disputes instead of approving", async ({
    page,
    browser,
  }) => {
    const { pairId } = await setupPair("pb-dispute");
    await loginViaUI(page, alice);
    await page.goto(`/pair/${pairId}`);

    await page.getByRole("button", { name: "+ Transaction" }).click();
    await page.getByPlaceholder("0.00").fill("40");
    await page.getByRole("button", { name: "Record Transaction" }).click();
    await expect(page.getByText("Transaction recorded — waiting for approval")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("pending-in")).toHaveText("+$40.00");

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await loginViaUI(pageB, bob);
    await pageB.goto(`/pair/${pairId}`);
    await expect(pageB.getByTestId("pending-out")).toHaveText("-$40.00");

    await pageB.getByRole("button", { name: "Dispute", exact: true }).click();
    await pageB.getByPlaceholder("Reason for dispute…").fill("Not owed");
    await pageB.getByRole("button", { name: "Submit Dispute" }).click();
    await expect(pageB.getByText("Transaction disputed — creator notified")).toBeVisible({
      timeout: 8_000,
    });

    // Disputed is no longer "pending", so it drops out of the projection on both sides
    // and the confirmed balance is untouched.
    await expect(pageB.getByTestId("pending-summary")).toHaveCount(0);
    await expect(page.getByTestId("pending-summary")).toHaveCount(0);
    expect((await pairData(pairId)).balance).toBe(0);

    await ctxB.close();
  });
});
