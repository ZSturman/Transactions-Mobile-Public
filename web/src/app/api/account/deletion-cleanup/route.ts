import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { cleanupDeletedAccounts } from "@/lib/account-deletion";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return NextResponse.json(
      { error: "Cleanup is not configured." },
      { status: 503 },
    );
  const received = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({
      removed: await cleanupDeletedAccounts(getAdminDb()),
    });
  } catch {
    return NextResponse.json(
      { error: "Cleanup could not finish; the next run will retry." },
      { status: 503 },
    );
  }
}
