import Link from "next/link";
import { ReactNode } from "react";
export function SupportContact() {
  const email = process.env.TRANSACTIONS_SUPPORT_EMAIL || "owner@example.com";
  return email ? (
    <a href={`mailto:${email}`} className="text-blue-600 underline">
      {email}
    </a>
  ) : (
    <span>
      Support contact is being configured. Please check back before creating an
      account.
    </span>
  );
}
export default function PublicInfo({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl space-y-6 px-5 py-12 text-gray-700">
      <Link href="/" className="text-xl font-bold text-blue-600">
        Transactions
      </Link>
      <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
      <div className="space-y-5 leading-relaxed">{children}</div>
      <footer className="flex flex-wrap gap-5 border-t pt-6 text-sm">
        <Link href="/privacy">Privacy</Link>
        <Link href="/support">Support</Link>
        <Link href="/delete-account">Delete account</Link>
        <Link href="/login">Sign in</Link>
      </footer>
    </main>
  );
}
