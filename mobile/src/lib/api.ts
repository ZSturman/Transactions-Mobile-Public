import { auth } from "./firebase";

export function appOrigin(): string {
  const value =
    process.env.EXPO_PUBLIC_APP_URL?.trim() ||
    "https://transactions-lmct.vercel.app";
  const url = new URL(value);
  const localBuild =
    process.env.EXPO_PUBLIC_USE_EMULATORS === "true" ||
    (typeof __DEV__ !== "undefined" && __DEV__);
  if (
    url.protocol !== "https:" &&
    !(
      localBuild &&
      ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname)
    )
  ) {
    throw new Error("Transactions requires an HTTPS application URL.");
  }
  if (
    process.env.EXPO_PUBLIC_USE_EMULATORS === "true" &&
    url.protocol === "https:"
  )
    throw new Error("Fixture builds require a local API URL.");
  return url.origin;
}

export async function authenticatedRequest(
  path: string,
  body: unknown = {},
  method = "POST",
) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(`${appOrigin()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || result.reason || "The request could not be completed.",
    );
  return result;
}
