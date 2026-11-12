import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import { GoogleAuthProvider, signInWithCredential, User } from "firebase/auth";
import { auth } from "./firebase";

/** Exchange the native Google token with the same Firebase Auth used by web. */
export async function signInWithGoogle(): Promise<User | null> {
  // iOS reads CLIENT_ID from the bundled GoogleService-Info.plist.
  GoogleSignin.configure({
    ...(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID && {
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    }),
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  if (!response.data.idToken) {
    throw new Error(
      "Google did not return a sign-in token. Check the native OAuth configuration.",
    );
  }
  const credential = GoogleAuthProvider.credential(response.data.idToken);
  const result = await signInWithCredential(auth, credential);
  return result.user;
}

export async function reauthenticateGoogle(): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Sign in again.");
  const { reauthenticateWithCredential } = await import("firebase/auth");
  GoogleSignin.configure({
    ...(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID && {
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    }),
  });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response))
    throw new Error("Reauthentication cancelled.");
  if (!response.data.idToken) throw new Error("Google did not return a token.");
  await reauthenticateWithCredential(
    currentUser,
    GoogleAuthProvider.credential(response.data.idToken),
  );
}
