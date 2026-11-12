import Link from "next/link";

export default function PublicLinks() {
  return (
    <nav
      aria-label="About and privacy"
      className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-blue-600"
    >
      <Link href="/about" className="hover:underline">About Transactions</Link>
      <Link href="/privacy" className="hover:underline">Privacy</Link>
      <Link href="/support" className="hover:underline">Support</Link>
    </nav>
  );
}
