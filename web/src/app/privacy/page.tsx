import PublicInfo, { SupportContact } from "@/components/PublicInfo";
export const metadata = { title: "Privacy | Transactions" };
export default function PrivacyPage() {
  return (
    <PublicInfo title="Privacy policy">
      <p>Last updated: October 23, 2026.</p>
      <p>
        Transactions helps you and another person record shared expenses,
        balances, and requests. It records obligations; it does not move money
        or connect to bank accounts.
      </p>
      <h2 className="text-xl font-semibold">Information we use</h2>
      <p>
        We store your account identifier, name, email address, optional profile
        image, selected currency, and notification preferences. We also store
        the contacts you invite, amounts, dates, descriptions, splits,
        approvals, disputes, and balance history you enter.
      </p>
      <h2 className="text-xl font-semibold">How information is shared</h2>
      <p>
        Your connected partner can see your shared transactions and contact
        identity. Invitation recipients receive the invitation information.
        Firebase provides authentication and database storage; Google and Apple
        process the sign-in options you choose; Vercel hosts the web application
        and API; Resend processes notification emails. These services receive
        information needed to provide those features.
      </p>
      <p>
        When you use Google sign-in on iOS, Google’s sign-in SDK may also
        process account contact information, including a phone number held by
        Google, approximate location, user and device identifiers, and sign-in
        usage information for authentication and SDK analytics. Its bundled
        privacy manifest declares this information as linked to your identity
        and not used for tracking. This does not grant Transactions access to
        your address book or device location permission. See{" "}
        <a className="text-blue-600 underline" href="https://policies.google.com/privacy">
          Google’s privacy policy
        </a>{" "}
        for its handling of this information.
      </p>
      <p>
        The app does not include advertising or tracking SDKs, sell personal
        information, or request access to your device’s contacts. Choosing an
        import file or sharing an export grants access to the file you select,
        not your entire device storage. An exported file contains personal and
        financial information; you choose where to share it.
      </p>
      <h2 className="text-xl font-semibold">Your choices and deletion</h2>
      <p>
        You can change email preferences, export your records, and initiate
        deletion in Settings. Deletion removes your authentication account and
        profile, cancels invitations, and anonymizes your identity in
        counterparties’ shared history. Shared obligation amounts remain for the
        other person; your authored descriptions and identifying contact details
        are removed. Shared records currently have no fixed automatic
        expiration. A temporary account deletion receipt prevents old sign-in
        tokens from recreating deleted data; it contains an account identifier
        but no name or email and becomes eligible for daily cleanup after two
        hours. Apple authorization is revoked when deleting an Apple-linked
        account.
      </p>
      <p>
        Notifications already delivered to someone else’s inbox and files you
        exported are outside the app’s control. Firebase, Vercel, Apple, Google,
        and Resend may retain operational records under their own policies.
      </p>
      <h2 className="text-xl font-semibold">Contact</h2>
      <p>
        For privacy or deletion questions: <SupportContact />.
      </p>
    </PublicInfo>
  );
}
