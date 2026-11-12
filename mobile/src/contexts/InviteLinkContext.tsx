import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { appOrigin } from "../lib/api";
const Context = createContext<{ inviteId: string | null; clear: () => void }>({
  inviteId: null,
  clear: () => {},
});
export const useInviteLink = () => useContext(Context);
export function InviteLinkProvider({ children }: { children: ReactNode }) {
  const [inviteId, setInviteId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function receive(url: string | null) {
      if (!url) return;
      try {
        const parsed = new URL(url);
        if (
          parsed.protocol !== "transactions:" &&
          parsed.origin !== appOrigin()
        )
          return;
        const path =
          parsed.protocol === "transactions:"
            ? `${parsed.hostname}${parsed.pathname}`
            : parsed.pathname.replace(/^\//, "");
        const match = path.match(/^invite\/([A-Za-z0-9_-]{1,128})\/?$/);
        if (match) {
          await AsyncStorage.setItem("transactions.pendingInvite", match[1]);
          if (active) setInviteId(match[1]);
        }
      } catch {}
    }
    void (async () => {
      const saved = await AsyncStorage.getItem("transactions.pendingInvite");
      if (active) setInviteId(saved);
      await receive(await Linking.getInitialURL());
    })();
    const sub = Linking.addEventListener("url", (e) => {
      void receive(e.url);
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        inviteId,
        clear: () => {
          setInviteId(null);
          void AsyncStorage.removeItem("transactions.pendingInvite");
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
