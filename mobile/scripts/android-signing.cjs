const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const dir = path.join(root, ".credentials");
const settings = path.join(dir, "android-upload.json");
const keystore = path.join(dir, "transactions-upload.keystore");
if (fs.existsSync(settings) || fs.existsSync(keystore)) {
  console.log("Existing upload signing material preserved.");
  process.exit(0);
}
fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const password = crypto.randomBytes(32).toString("base64url");
const result = spawnSync(
  "keytool",
  [
    "-genkeypair",
    "-v",
    "-keystore",
    keystore,
    "-alias",
    "transactions-upload",
    "-keyalg",
    "RSA",
    "-keysize",
    "2048",
    "-validity",
    "10000",
    "-dname",
    "CN=Transactions",
    "-storepass:env",
    "TRANSACTIONS_KEY_PASSWORD",
    "-keypass:env",
    "TRANSACTIONS_KEY_PASSWORD",
  ],
  {
    env: { ...process.env, TRANSACTIONS_KEY_PASSWORD: password },
    encoding: "utf8",
  },
);
if (result.status !== 0) {
  console.error(
    "Upload key generation failed. Check the installed Java keytool.",
  );
  process.exit(1);
}
fs.writeFileSync(
  settings,
  JSON.stringify(
    {
      storeFile: keystore,
      keyAlias: "transactions-upload",
      storePassword: password,
      keyPassword: password,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
fs.chmodSync(keystore, 0o600);
console.log(
  "Upload signing material created under mobile/.credentials. Back up this directory securely before uploading to Play. Passwords were not printed.",
);
