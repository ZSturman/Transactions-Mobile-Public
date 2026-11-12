// Read-only App Store review status. Source .credentials/release.env first.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

(async () => {
  const record = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../store/release-status.json"), "utf8"),
  );
  for (const name of [
    "APP_STORE_CONNECT_KEY_ID",
    "APP_STORE_CONNECT_ISSUER_ID",
    "APP_STORE_CONNECT_KEY_FILE",
  ]) {
    if (!process.env[name]) throw new Error(`Set ${name} before checking review.`);
  }
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encoded({ alg: "ES256", kid: process.env.APP_STORE_CONNECT_KEY_ID, typ: "JWT" })}.${encoded({ iss: process.env.APP_STORE_CONNECT_ISSUER_ID, iat: now, exp: now + 300, aud: "appstoreconnect-v1" })}`;
  const signature = crypto.sign("sha256", Buffer.from(unsigned), {
    key: fs.readFileSync(process.env.APP_STORE_CONNECT_KEY_FILE),
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  async function get(endpoint) {
    const response = await fetch(`https://api.appstoreconnect.apple.com${endpoint}`, {
      headers: { Authorization: `Bearer ${unsigned}.${signature}` },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`App Store status request failed: HTTP ${response.status}.`);
    return response.json();
  }
  const [submission, versions] = await Promise.all([
    get(`/v1/reviewSubmissions/${encodeURIComponent(record.ios.submissionId)}`),
    get(`/v1/apps/${encodeURIComponent(record.ios.appId)}/appStoreVersions?filter[platform]=IOS&limit=10`),
  ]);
  const version = versions.data.find((item) => item.attributes.versionString === record.ios.version);
  if (!version) throw new Error("Recorded iOS version was not found in App Store Connect.");
  console.log(JSON.stringify({
    appId: record.ios.appId,
    submissionId: submission.data.id,
    reviewState: submission.data.attributes.state,
    version: version.attributes.versionString,
    appStoreState: version.attributes.appStoreState,
    releaseType: version.attributes.releaseType,
  }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
