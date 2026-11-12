import Link from "next/link";
import PublicInfo, { SupportContact } from "@/components/PublicInfo";
export const metadata = { title: "Delete your account | Transactions" };
export default function DeleteAccountPage() {
  return (
    <PublicInfo title="Delete your Transactions account">
      <p>
        You can request account and data deletion from the iOS or Android app by
        opening Settings → Delete account. On the web, sign in below, open
        Settings, and choose Danger Zone → Permanently Delete Account.
      </p>
      <Link
        className="inline-block rounded-lg bg-blue-600 px-5 py-3 text-white"
        href="/login?continue=%2Fsettings"
      >
        Sign in to delete your account
      </Link>
      <p>
        You must confirm deletion and verify your identity again. Apple-linked
        accounts also verify Apple authorization so access can be revoked.
        Deletion is permanent.
      </p>
      <p>
        Your profile and login are deleted, invitations are cancelled, and
        identifying details in shared financial history are anonymized. Other
        people’s existing obligation amounts and necessary shared records
        remain. Delivered emails and previously exported files are outside the
        app’s control.
      </p>
      <p>
        If you cannot access your account, request assistance from{" "}
        <SupportContact />. We must verify account ownership before acting on a
        request; a password is never required by email.
      </p>
    </PublicInfo>
  );
}
