import type { Persistence } from "firebase/auth";

/**
 * firebase/auth's package.json lists a platform-agnostic "types" condition
 * before its "react-native" condition, so TypeScript's exports resolution
 * always picks the web types and misses this RN-only export even though
 * Metro correctly bundles the RN implementation at runtime.
 */
declare module "firebase/auth" {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
