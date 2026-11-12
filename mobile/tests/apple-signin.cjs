const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const filename = path.resolve(__dirname, "../src/lib/appleSignIn.ts");
const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function fixture(response = {}, signedIn = true) {
  const calls = [];
  const user = { uid: "existing-account", displayName: "Existing" };
  const auth = { currentUser: signedIn ? user : null };
  const mocks = {
    "react-native": { Platform: { OS: "ios" } },
    "expo-crypto": {
      randomUUID: () => "raw-fixture-nonce",
      CryptoDigestAlgorithm: { SHA256: "SHA256" },
      digestStringAsync: async (algorithm, value) => {
        assert.equal(value, "raw-fixture-nonce");
        return "hashed-fixture-nonce";
      },
    },
    "expo-apple-authentication": {
      isAvailableAsync: async () => true,
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      signInAsync: async (options) => {
        assert.equal(options.nonce, "hashed-fixture-nonce");
        return {
          identityToken: "fixture-id-token",
          authorizationCode: "fixture-code",
          ...response,
        };
      },
    },
    "firebase/auth": {
      OAuthProvider: class {
        constructor(id) {
          assert.equal(id, "apple.com");
        }
        credential(value) {
          assert.equal(value.rawNonce, "raw-fixture-nonce");
          return value;
        }
      },
      signInWithCredential: async (a, c) => {
        assert.equal(a, auth);
        calls.push("sign-in");
        return { user };
      },
      linkWithCredential: async (u, c) => {
        assert.equal(u, user);
        calls.push("link");
        return { user };
      },
      reauthenticateWithCredential: async (u, c) => {
        assert.equal(u, user);
        calls.push("reauthenticate");
        return { user };
      },
      updateProfile: async () => {
        calls.push("profile");
      },
    },
    "./firebase": { auth },
  };
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, {
    filename,
  })(
    (name) => {
      assert(name in mocks);
      return mocks[name];
    },
    module,
    module.exports,
  );
  return { ...module.exports, calls, user };
}
(async () => {
  const login = fixture();
  assert.equal(await login.signInApple(), login.user);
  assert.deepEqual(login.calls, ["sign-in"]);
  console.log("PASS: Apple token uses nonce-bound Firebase sign-in");
  const linking = fixture();
  await linking.linkApple();
  assert.deepEqual(linking.calls, ["link"]);
  console.log(
    "PASS: linking preserves the authenticated account without a separate sign-in",
  );
  const noSession = fixture({}, false);
  await assert.rejects(noSession.linkApple(), /existing account/);
  assert.deepEqual(noSession.calls, []);
  console.log("PASS: Apple linking requires an existing authenticated account");
  const missing = fixture({ identityToken: null });
  await assert.rejects(missing.signInApple(), /identity token/);
  assert.deepEqual(missing.calls, []);
  console.log("PASS: missing Apple tokens cannot create a session");
  const reauth = fixture();
  assert.equal(await reauth.reauthenticateApple(), "fixture-code");
  assert.deepEqual(reauth.calls, ["reauthenticate"]);
  console.log(
    "PASS: deletion reauthenticates before exposing the Apple authorization code",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
