import { Platform } from "react-native";
import * as Apple from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  OAuthProvider,
  signInWithCredential,
  linkWithCredential,
  reauthenticateWithCredential,
  updateProfile,
} from "firebase/auth";
import { auth } from "./firebase";

export async function appleCredential() {
  if (Platform.OS !== "ios" || !(await Apple.isAvailableAsync()))
    throw new Error("Sign in with Apple is unavailable on this device.");
  const rawNonce = Crypto.randomUUID();
  const nonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );
  const response = await Apple.signInAsync({
    requestedScopes: [
      Apple.AppleAuthenticationScope.FULL_NAME,
      Apple.AppleAuthenticationScope.EMAIL,
    ],
    nonce,
  });
  if (!response.identityToken)
    throw new Error("Apple did not return an identity token.");
  const credential = new OAuthProvider("apple.com").credential({
    idToken: response.identityToken,
    rawNonce,
  });
  return { credential, response };
}
export async function signInApple() {
  const { credential, response } = await appleCredential();
  const result = await signInWithCredential(auth, credential);
  if (!result.user.displayName && response.fullName) {
    const displayName = [
      response.fullName.givenName,
      response.fullName.familyName,
    ]
      .filter(Boolean)
      .join(" ");
    if (displayName) await updateProfile(result.user, { displayName });
  }
  return result.user;
}
export async function linkApple() {
  if (!auth.currentUser)
    throw new Error("Sign in with your existing account first.");
  const { credential } = await appleCredential();
  await linkWithCredential(auth.currentUser, credential);
}
export async function reauthenticateApple() {
  if (!auth.currentUser) throw new Error("Sign in again.");
  const { credential, response } = await appleCredential();
  await reauthenticateWithCredential(auth.currentUser, credential);
  return response.authorizationCode;
}
