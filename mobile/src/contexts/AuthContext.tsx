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
  signOut,
  updateProfile,
} from "firebase/auth";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { signInWithGoogle } from "../lib/googleSignIn";
import { signInApple as authenticateApple } from "../lib/appleSignIn";
import { UserProfile } from "../types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signUpEmail: (
    email: string,
    password: string,
    displayName: string,
    currency: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

  const profile = {
    uid: user.uid,
    email: user.email ?? "",
    displayName: user.displayName ?? "",
    photoURL: user.photoURL ?? "",
    currency: extra?.currency ?? "USD",
    createdAt: serverTimestamp(),
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
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (snap.exists()) {
      setProfile({ uid: auth.currentUser.uid, ...snap.data() } as UserProfile);
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
          console.error("Failed to load user profile:", err);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    // Explicit screenshot fixture mode is restricted to the demo-test emulators.
    if (
      process.env.EXPO_PUBLIC_USE_EMULATORS === "true" &&
      process.env.EXPO_PUBLIC_FIXTURE_AUTO_LOGIN === "true" &&
      auth.app.options.projectId === "demo-test"
    ) {
      void signInWithEmailAndPassword(
        auth,
        "alice@transactions.example.test",
        "Fixture-only-password-123",
      ).catch(() => {
        setLoading(false);
      });
    }
    return unsub;
  }, []);

  async function signInEmail(email: string, password: string) {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const p = await ensureUserDoc(cred.user);
    setProfile(p);
  }

  async function signUpEmail(
    email: string,
    password: string,
    displayName: string,
    currency: string,
  ) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    await cred.user.getIdToken(true);
    const p = await ensureUserDoc(cred.user, { currency });
    setProfile(p);
  }

  async function signInGoogle() {
    const googleUser = await signInWithGoogle();
    if (googleUser) setProfile(await ensureUserDoc(googleUser));
  }

  async function signInApple() {
    const appleUser = await authenticateApple();
    setProfile(await ensureUserDoc(appleUser));
  }

  async function logout() {
    await signOut(auth);
    if (GoogleSignin.hasPreviousSignIn()) {
      await GoogleSignin.signOut();
    }
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
        signInGoogle,
        signInApple,
        signUpEmail,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
