const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
require("./check-release-env.cjs");
if (process.env.EXPO_PUBLIC_USE_EMULATORS === "true")
  throw Error("Fixture builds cannot be submitted to a store.");
const filename =
  process.env.TRANSACTIONS_ANDROID_SIGNING_FILE ||
  path.join(root, ".credentials/android-upload.json");
if (!fs.existsSync(filename))
  throw Error(
    "Run npm run android:signing:init first and securely back up mobile/.credentials.",
  );
const config = JSON.parse(fs.readFileSync(filename, "utf8"));
for (const key of ["storeFile", "storePassword", "keyAlias", "keyPassword"])
  if (!config[key]) throw Error(`Missing ${key} in private signing settings.`);
function run(cmd, args, cwd, env = process.env) {
  const result = spawnSync(cmd, args, { cwd, env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (!process.argv.includes("--skip-prebuild")) {
  run(
    path.join(root, "node_modules/.bin/expo"),
    ["prebuild", "--platform", "android", "--no-install"],
    root,
  );
}

const env = {
  ...process.env,
  TRANSACTIONS_STORE_FILE: config.storeFile,
  TRANSACTIONS_STORE_PASSWORD: config.storePassword,
  TRANSACTIONS_KEY_ALIAS: config.keyAlias,
  TRANSACTIONS_KEY_PASSWORD: config.keyPassword,
};
run(
  "./gradlew",
  [
    ":app:bundleRelease",
    ":app:assembleRelease",
    "--console=plain",
    "--max-workers=2",
  ],
  path.join(root, "android"),
  env,
);
const output = path.join(root, "build/android");
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(
  path.join(root, "android/app/build/outputs/bundle/release/app-release.aab"),
  path.join(output, "Transactions.aab"),
);
fs.copyFileSync(
  path.join(root, "android/app/build/outputs/apk/release/app-release.apk"),
  path.join(output, "Transactions.apk"),
);
console.log(
  "Signed Android artifacts: build/android/Transactions.aab and Transactions.apk",
);
