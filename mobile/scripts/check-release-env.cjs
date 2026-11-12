const path = require("node:path");
const root = path.resolve(__dirname, "..");
require("@expo/env").load(root);
if (
  process.env.EXPO_PUBLIC_USE_EMULATORS === "true" ||
  process.env.EXPO_PUBLIC_FIXTURE_AUTO_LOGIN === "true"
)
  throw Error("Emulator/fixture builds cannot be archived for a store.");
const origin = new URL(
  process.env.EXPO_PUBLIC_APP_URL || "https://transactions-lmct.vercel.app",
);
if (origin.protocol !== "https:")
  throw Error("Store builds require an HTTPS application URL.");
if (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== "transactions-c0f7e")
  throw Error(
    "Store builds must use the existing Transactions Firebase project.",
  );
console.log("Production environment checks passed.");
