"use client";

import { usePathname } from "next/navigation";
import PublicHome from "@/components/PublicHome";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <ProtectedRoute publicFallback={pathname === "/" ? <PublicHome /> : undefined}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}
