const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const settings = path.join(root, ".credentials/android-upload.json");
const variant = process.argv[2] || "upload";
const config =
  variant === "debug"
    ? {
        storeFile: path.join(root, "android/app/debug.keystore"),
        keyAlias: "androiddebugkey",
        storePassword: "android",
      }
    : JSON.parse(fs.readFileSync(settings, "utf8"));
const result = spawnSync(
  "keytool",
  [
    "-list",
    "-v",
    "-keystore",
    config.storeFile,
    "-alias",
    config.keyAlias,
    "-storepass:env",
    "TRANSACTIONS_KEY_PASSWORD",
  ],
  {
    env: { ...process.env, TRANSACTIONS_KEY_PASSWORD: config.storePassword },
    encoding: "utf8",
  },
);
if (result.status !== 0) {
  console.error("Could not read certificate.");
  process.exit(1);
}
for (const line of result.stdout.split("\n"))
  if (/SHA1:|SHA256:/.test(line)) console.log(line.trim());
