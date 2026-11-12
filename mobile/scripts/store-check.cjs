const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
require("./check-release-env.cjs");
const platform = process.argv[2];
const failures = [];
function requireValue(name) {
  if (!process.env[name]) failures.push(`Set ${name}.`);
}
function requireFile(file, label = file) {
  if (!fs.existsSync(file)) failures.push(`Missing ${label}.`);
}
function pngs(dir) {
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true })
        .filter((name) => /\.(png|jpg|jpeg)$/i.test(String(name))).length
    : 0;
}
(async () => {
  if (!["ios", "android"].includes(platform)) {
    console.error("Usage: npm run store:check -- ios|android");
    process.exit(2);
  }
  if (process.env.EXPO_PUBLIC_USE_EMULATORS === "true")
    failures.push("Never submit an emulator fixture build.");
  process.env.TRANSACTIONS_SUPPORT_EMAIL ||= "owner@example.com";
  const origin =
    process.env.EXPO_PUBLIC_APP_URL || "https://transactions-lmct.vercel.app";
  for (const route of ["/privacy", "/support", "/delete-account"]) {
    try {
      const response = await fetch(origin + route, {
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.text();
      if (!response.ok || body.includes("Support contact is being configured"))
        failures.push(`Deploy and configure ${origin + route}.`);
    } catch {
      failures.push(`Could not verify ${origin + route}.`);
    }
  }
  if (platform === "ios") {
    for (const name of [
      "APPLE_TEAM_ID",
      "APP_STORE_CONNECT_KEY_ID",
      "APP_STORE_CONNECT_ISSUER_ID",
      "APP_STORE_CONNECT_KEY_FILE",
      "APP_REVIEW_FIRST_NAME",
      "APP_REVIEW_LAST_NAME",
      "APP_REVIEW_PHONE",
      "APP_REVIEW_EMAIL",
      "APP_REVIEW_DEMO_EMAIL",
      "APP_REVIEW_DEMO_PASSWORD",
    ])
      requireValue(name);
    requireFile(
      path.join(root, "build/ios/Transactions.ipa"),
      "App Store signed Transactions.ipa",
    );
    if (process.env.APP_STORE_CONNECT_KEY_FILE)
      requireFile(
        process.env.APP_STORE_CONNECT_KEY_FILE,
        "App Store Connect API key file",
      );
    if (!pngs(path.join(root, "store/screenshots/ios")))
      failures.push(
        "Add real iPhone/iPad screenshots under store/screenshots/ios/en-US.",
      );
  } else {
    requireValue("GOOGLE_PLAY_SERVICE_ACCOUNT_FILE");
    requireValue("ANDROID_PLAY_SIGNING_SHA256");
    if (process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE)
      requireFile(
        process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE,
        "Google Play service account file",
      );
    requireFile(
      path.join(root, "build/android/Transactions.aab"),
      "signed Transactions.aab",
    );
    if (!pngs(path.join(root, "store/google-play/en-US/images")))
      failures.push(
        "Add real phone/tablet screenshots and required listing graphics under store/google-play/en-US/images.",
      );
  }
  if (failures.length) {
    console.error(failures.map((v) => `• ${v}`).join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      `${platform} packaging prerequisites passed. Store account setup, privacy questionnaires, ratings, native acceptance, and OAuth branding must also be complete before submission.`,
    );
})();
