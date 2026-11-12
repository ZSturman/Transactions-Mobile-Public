import {
  acceptInviteForUser,
  cancelInviteForUser,
} from "../utils/inviteActions";
import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDocs,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Invite } from "../types";

export function isInviteExpired(invite: Pick<Invite, "expiresAt">): boolean {
  return Boolean(
    invite.expiresAt?.toMillis && invite.expiresAt.toMillis() <= Date.now(),
  );
}

export function useInvites() {
  const { user } = useAuth();
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [sentInvites, setSentInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.email) {
      setPendingInvites([]);
      setSentInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setPendingInvites([]);
    setSentInvites([]);
    let receivedLoaded = false;
    let sentLoaded = false;
    const receivedQ = query(
      collection(db, "invites"),
      where("toEmail", "==", user.email.toLowerCase()),
      where("status", "==", "pending"),
    );
    const sentQ = query(
      collection(db, "invites"),
      where("fromUid", "==", user.uid),
      where("status", "==", "pending"),
    );

    const unsubReceived = onSnapshot(
      receivedQ,
      (snap) => {
        setPendingInvites(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Invite)
            .filter((invite) => !isInviteExpired(invite)),
        );
        receivedLoaded = true;
        if (sentLoaded) setLoading(false);
      },
      () => {
        receivedLoaded = true;
        setPendingInvites([]);
        if (sentLoaded) setLoading(false);
      },
    );
    const unsubSent = onSnapshot(
      sentQ,
      (snap) => {
        setSentInvites(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as Invite)
            .filter((invite) => !isInviteExpired(invite)),
        );
        sentLoaded = true;
        if (receivedLoaded) setLoading(false);
      },
      () => {
        sentLoaded = true;
        setSentInvites([]);
        if (receivedLoaded) setLoading(false);
      },
    );

    return () => {
      unsubReceived();
      unsubSent();
    };
  }, [user]);

  const acceptInvite = (invite: Invite) => {
    if (!user) throw new Error("Sign in to accept an invitation.");
    return acceptInviteForUser(invite, user);
  };
  const cancelInvite = (invite: Invite) => {
    if (!user) throw new Error("Sign in to cancel an invitation.");
    return cancelInviteForUser(invite, user);
  };
  return { pendingInvites, sentInvites, loading, acceptInvite, cancelInvite };
}
