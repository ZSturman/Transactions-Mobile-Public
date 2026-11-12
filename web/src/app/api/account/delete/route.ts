import { NextRequest, NextResponse } from "next/server";
import {
  getAdminAuth,
  getAdminDb,
  FirebaseAdminUnavailableError,
} from "@/lib/firebase-admin";
import {
  deleteAccountData,
  requireRecentAuthentication,
  DeletionError,
} from "@/lib/account-deletion";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token)
      return NextResponse.json(
        { error: "Sign in to delete your account." },
        { status: 401 },
      );
    const auth = getAdminAuth();
    let actor;
    try {
      actor = await auth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    }
    requireRecentAuthentication(actor);
    const text = await request.text();
    if (text.length > 8192)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413 },
      );
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || body.confirmation !== "DELETE")
      return NextResponse.json(
        { error: "Confirm account deletion." },
        { status: 400 },
      );
    if (
      body.appleAuthorizationCode != null &&
      (typeof body.appleAuthorizationCode !== "string" ||
        body.appleAuthorizationCode.length > 4096)
    )
      return NextResponse.json(
        { error: "Invalid Apple authorization." },
        { status: 400 },
      );
    if (
      body.appleAccessToken != null &&
      (typeof body.appleAccessToken !== "string" ||
        body.appleAccessToken.length > 4096)
    )
      return NextResponse.json(
        { error: "Invalid Apple token." },
        { status: 400 },
      );
    await deleteAccountData(getAdminDb(), auth, actor.uid, {
      appleCode: body.appleAuthorizationCode || undefined,
      appleAccessToken: body.appleAccessToken || undefined,
      firebaseToken: token,
    });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof DeletionError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof FirebaseAdminUnavailableError)
      return NextResponse.json(
        { error: "Account deletion is temporarily unavailable." },
        { status: 503 },
      );
    return NextResponse.json(
      {
        error:
          "Deletion did not finish. Sign in again and retry; completed cleanup will be resumed.",
      },
      { status: 503 },
    );
  }
}
