import Link from "next/link";
import PublicInfo from "@/components/PublicInfo";

export default function PublicHome() {
  return (
    <PublicInfo title="Shared expenses. Clear balances.">
      <p className="text-lg">
        Transactions helps you and the people you know keep track of who owes
        whom. Record shared expenses, review requests together, and follow your
        balance over time on the web, iPhone, and iPad.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/register" className="btn-primary">Create an account</Link>
        <Link href="/login" className="btn-secondary">Sign in</Link>
      </div>
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">Keep a shared record</h2>
        <p>
          Invite a contact, enter an expense with a date and description, and
          choose how to split it. Your connected partner can approve, decline,
          or discuss the request. Pending requests stay visible before they
          affect your approved balance.
        </p>
      </section>
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">See the whole picture</h2>
        <p>
          Balance and activity charts show your history across selectable
          periods. Search and filter your contacts, inspect individual
          transactions, and request settlement when you are ready. Transactions
          records obligations; it does not send payments or connect to banks.
        </p>
      </section>
      <section className="card space-y-3">
        <h2 className="text-xl font-semibold text-gray-900">Control your information</h2>
        <p>
          Sign in with email, Google, or Apple. Google sign-in supplies your
          account identity, name, email, and optional profile image to help you
          access your account and identify yourself to connected partners.
          Import CSV records, export CSV or JSON, manage notification
          preferences, and request account deletion from Settings.
        </p>
        <p>
          Read our <Link href="/privacy" className="text-blue-600 underline">privacy policy</Link>{" "}
          for how account and shared-expense information is used, stored, and
          shared. Questions are welcome on our{" "}
          <Link href="/support" className="text-blue-600 underline">support page</Link>.
        </p>
      </section>
    </PublicInfo>
  );
}
