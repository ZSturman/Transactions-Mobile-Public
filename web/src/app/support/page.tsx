import PublicInfo, { SupportContact } from "@/components/PublicInfo";
export const metadata = { title: "Support | Transactions" };
export default function SupportPage() {
  return (
    <PublicInfo title="Transactions support">
      <p>
        For help with sign-in, invitations, imports, or your account, contact{" "}
        <SupportContact />.
      </p>
      <p>
        Include your app version, whether you use iOS, Android, or the web, and
        a brief description of the problem. Never send passwords, sign-in codes,
        private keys, or exported financial records.
      </p>
      <h2 className="text-xl font-semibold">Common questions</h2>
      <p>
        Use the same Google account on mobile and the web to see the same
        balances. If you use Apple’s Hide My Email, its private address may
        represent a separate account. To use Apple with an existing account,
        sign into that account first and choose “Link Sign in with Apple” in iOS
        Settings.
      </p>
      <p>
        Pending transactions do not change confirmed balances until approval.
        Settlement requires partner approval even when auto-approve is enabled.
        Invitation links must be accepted using the recipient’s email address.
      </p>
    </PublicInfo>
  );
}
