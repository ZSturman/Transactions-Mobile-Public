import { existsSync } from "node:fs";
import { ExpoConfig, ConfigContext } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => {
  const origin = new URL(
    process.env.EXPO_PUBLIC_APP_URL || "https://transactions-lmct.vercel.app",
  );
  return {
    ...config,
    name: "Transactions",
    slug: "transactions-mobile",
    scheme: "transactions",
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
      associatedDomains: [`applinks:${origin.hostname}`],
      buildNumber:
        process.env.IOS_BUILD_NUMBER || config.ios?.buildNumber || "1",
      infoPlist: {
        ...config.ios?.infoPlist,
        CFBundleDisplayName: "Transactions",
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      ...config.android,
      versionCode: Number(
        process.env.ANDROID_VERSION_CODE || config.android?.versionCode || 1,
      ),
      ...(existsSync("./google-services.json")
        ? { googleServicesFile: "./google-services.json" }
        : {}),
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            { scheme: "https", host: origin.hostname, pathPrefix: "/invite/" },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    plugins: [...(config.plugins || []), "expo-apple-authentication"],
  };
};
