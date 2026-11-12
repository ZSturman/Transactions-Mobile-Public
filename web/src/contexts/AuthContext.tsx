"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  reauthenticateWithPopup,
  reauthenticateWithCredential,
  EmailAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  writeBatch,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";
import { DEFAULT_NOTIFICATION_PREFERENCES, UserProfile } from "@/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (
    email: string,
    password: string,
    displayName: string,
    currency: string,
  ) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  deleteAccount: (password?: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isFirestoreUnavailableError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "unavailable"
  );
}

function profileFromAuthUser(
  user: User,
  current?: UserProfile | null,
): UserProfile {
  return {
    uid: user.uid,
    email: user.email ?? current?.email ?? "",
    displayName: user.displayName ?? current?.displayName ?? "",
    photoURL: user.photoURL ?? current?.photoURL ?? "",
    currency: current?.currency ?? "USD",
    notificationPreferences:
      current?.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
    createdAt: current?.createdAt ?? Timestamp.now(),
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

async function ensureUserDoc(
  user: User,
  extra?: { currency?: string },
): Promise<UserProfile> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { uid: user.uid, ...snap.data() } as UserProfile;

  const profile: Omit<UserProfile, "createdAt"> & {
    createdAt: ReturnType<typeof serverTimestamp>;
  } = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    photoURL: user.photoURL ?? "",
    currency: extra?.currency ?? "USD",
    notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
    createdAt: serverTimestamp() as any,
  };
  await setDoc(ref, profile);
  const fresh = await getDoc(ref);
  return { uid: user.uid, ...fresh.data() } as UserProfile;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshProfile() {
    if (!auth.currentUser) return;
    const ref = doc(db, "users", auth.currentUser.uid);
    try {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setProfile({
          uid: auth.currentUser.uid,
          ...snap.data(),
        } as UserProfile);
      } else {
        setProfile((prev) => profileFromAuthUser(auth.currentUser!, prev));
      }
    } catch (err) {
      if (isFirestoreUnavailableError(err)) {
        setProfile(
          (prev) => prev ?? profileFromAuthUser(auth.currentUser!, prev),
        );
        return;
      }
      throw err;
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const p = await ensureUserDoc(u);
          setProfile(p);
        } catch (err) {
          if (isFirestoreUnavailableError(err)) {
            setProfile((prev) => prev ?? profileFromAuthUser(u, prev));
          } else {
            console.error("Failed to load user profile:", err);
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const onOnline = () => {
      refreshProfile().catch(() => undefined);
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  async function signInEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    try {
      const p = await ensureUserDoc(cred.user);
      setProfile(p);
    } catch (err) {
      if (isFirestoreUnavailableError(err)) {
        setProfile((prev) => profileFromAuthUser(cred.user, prev));
        return;
      }
      throw err;
    }
  }

  async function signUpEmail(
    email: string,
    password: string,
    displayName: string,
    currency: string,
  ) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    // Wait for a current ID token before the first Firestore write. Without
    // this, a just-created account can occasionally race the Firestore
    // credential listener and have its first request evaluated as anonymous.
    await cred.user.getIdToken(true);
    const p = await ensureUserDoc(cred.user, { currency });
    setProfile(p);
  }

  async function signInGoogle() {
    const cred = await signInWithPopup(auth, googleProvider);
    try {
      const p = await ensureUserDoc(cred.user);
      setProfile(p);
    } catch (err) {
      if (isFirestoreUnavailableError(err)) {
        setProfile((prev) => profileFromAuthUser(cred.user, prev));
        return;
      }
      throw err;
    }
  }

  async function signInApple() {
    const provider = new OAuthProvider("apple.com");
    provider.addScope("email");
    provider.addScope("name");
    const credential = await signInWithPopup(auth, provider);
    setProfile(await ensureUserDoc(credential.user));
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  async function deleteAccount(password?: string) {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error("Not authenticated");
    let appleAccessToken: string | undefined;
    if (
      currentUser.providerData.some(
        (provider) => provider.providerId === "apple.com",
      )
    ) {
      const result = await reauthenticateWithPopup(
        currentUser,
        new OAuthProvider("apple.com"),
      );
      appleAccessToken =
        OAuthProvider.credentialFromResult(result)?.accessToken;
      if (!appleAccessToken)
        throw new Error("Apple did not return an access token. Please retry.");
    } else if (
      currentUser.providerData.some(
        (provider) => provider.providerId === "google.com",
      )
    ) {
      await reauthenticateWithPopup(currentUser, googleProvider);
    } else {
      if (!password || !currentUser.email)
        throw new Error("Enter your current password.");
      await reauthenticateWithCredential(
        currentUser,
        EmailAuthProvider.credential(currentUser.email, password),
      );
    }
    const token = await currentUser.getIdToken(true);
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ confirmation: "DELETE", appleAccessToken }),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Deletion did not finish. Please retry.");
    await signOut(auth);
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInEmail,
        signUpEmail,
        signInGoogle,
        signInApple,
        logout,
        refreshProfile,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
