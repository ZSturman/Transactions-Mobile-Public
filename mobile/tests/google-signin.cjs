const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src/lib/googleSignIn.ts');
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(response, failure) {
  const calls = [];
  const auth = { testOnly: true };
  const user = { uid: 'existing-web-google-user' };
  const mocks = {
    '@react-native-google-signin/google-signin': {
      GoogleSignin: {
        configure: () => calls.push('configure'),
        hasPlayServices: async () => calls.push('services'),
        signIn: async () => { calls.push('picker'); if (failure) throw failure; return response; },
      },
      isSuccessResponse: r => r.type === 'success',
    },
    'firebase/auth': {
      GoogleAuthProvider: { credential: token => { calls.push(['credential', token]); return { token }; } },
      signInWithCredential: async (actualAuth, credential) => {
        assert.equal(actualAuth, auth);
        calls.push(['firebase', credential.token]);
        return { user };
      },
    },
    './firebase': { auth },
  };
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {${code}\n})`, { filename })(name => {
    assert(name in mocks, `Unexpected module: ${name}`);
    return mocks[name];
  }, module, module.exports);
  return { ...module.exports, calls, user };
}

async function main() {
  const success = fixture({ type: 'success', data: { idToken: 'fixture-google-token' } });
  assert.equal(await success.signInWithGoogle(), success.user);
  assert.deepEqual(success.calls, ['configure', 'services', 'picker', ['credential', 'fixture-google-token'], ['firebase', 'fixture-google-token']]);
  console.log('PASS: native Google token signs into the existing Firebase Auth instance');

  const cancelled = fixture({ type: 'cancelled' });
  assert.equal(await cancelled.signInWithGoogle(), null);
  assert.deepEqual(cancelled.calls, ['configure', 'services', 'picker']);
  console.log('PASS: cancellation performs no Firebase sign-in');

  const missing = fixture({ type: 'success', data: { idToken: null } });
  await assert.rejects(missing.signInWithGoogle(), /did not return a sign-in token/);
  assert.deepEqual(missing.calls, ['configure', 'services', 'picker']);
  console.log('PASS: missing Google tokens cannot create a Firebase session');

  const failure = fixture(null, new Error('Native provider unavailable'));
  await assert.rejects(failure.signInWithGoogle(), /Native provider unavailable/);
  assert.deepEqual(failure.calls, ['configure', 'services', 'picker']);
  console.log('PASS: native errors propagate without a Firebase sign-in');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
