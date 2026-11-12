import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  Auth,
  connectAuthEmulator,
} from "firebase/auth";
import {
  getFirestore,
  Firestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  return getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
}

const useEmulators = process.env.EXPO_PUBLIC_USE_EMULATORS === "true";
if (useEmulators)
  Object.assign(firebaseConfig, {
    projectId: "demo-test",
    apiKey: "demo-api-key",
    appId: "demo-transactions-native",
    authDomain: "demo-test.firebaseapp.com",
  });
const app = getFirebaseApp();

export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db: Firestore = getFirestore(app);

if (useEmulators) {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || "127.0.0.1";
  connectAuthEmulator(auth, `http://${host}:9199`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8180);
}
