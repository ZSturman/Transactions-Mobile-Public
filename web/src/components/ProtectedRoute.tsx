"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function ProtectedRoute({ children, publicFallback }: {
  children: React.ReactNode;
  publicFallback?: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowSignedOut = publicFallback !== undefined;

  useEffect(() => {
    if (!loading && !user && !allowSignedOut) {
      router.replace("/login");
    }
  }, [user, loading, router, allowSignedOut]);

  if (loading && allowSignedOut) return <>{publicFallback}</>;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!user) return <>{publicFallback ?? null}</>;
  return <>{children}</>;
}
