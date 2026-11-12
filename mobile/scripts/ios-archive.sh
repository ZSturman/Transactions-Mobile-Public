#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/check-release-env.cjs
if [[ "${EXPO_PUBLIC_USE_EMULATORS:-false}" == "true" ]]; then echo "Fixture builds cannot be archived for the store." >&2; exit 2; fi
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to your Apple Developer team ID.}"
if [[ "${1:-}" != "--skip-prebuild" ]]; then
  ./node_modules/.bin/expo prebuild --platform ios --no-install
  pod install --project-directory=ios
fi
authentication_args=()
if [[ -n "${APP_STORE_CONNECT_KEY_FILE:-}" ]]; then
  : "${APP_STORE_CONNECT_KEY_ID:?Set the existing App Store Connect key ID.}"
  : "${APP_STORE_CONNECT_ISSUER_ID:?Set the App Store Connect issuer ID.}"
  authentication_args=(-authenticationKeyPath "$APP_STORE_CONNECT_KEY_FILE" -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID")
fi
mkdir -p build
log_file="${TMPDIR:-/tmp}/transactions-ios-archive.log"
if ! xcodebuild -workspace ios/Transactions.xcworkspace -scheme Transactions -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build/DerivedData-ios \
  -archivePath build/Transactions.xcarchive -allowProvisioningUpdates \
  "${authentication_args[@]}" "DEVELOPMENT_TEAM=$APPLE_TEAM_ID" archive > "$log_file" 2>&1; then
  tail -n 35 "$log_file"
  echo "Full diagnostics: $log_file" >&2
  exit 1
fi
cat > build/ExportOptions.plist <<PLIST
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>method</key><string>app-store-connect</string><key>teamID</key><string>$APPLE_TEAM_ID</string><key>signingStyle</key><string>automatic</string><key>uploadSymbols</key><true/></dict></plist>
PLIST
xcodebuild -exportArchive -archivePath build/Transactions.xcarchive -exportPath build/ios -exportOptionsPlist build/ExportOptions.plist -allowProvisioningUpdates "${authentication_args[@]}" >> "$log_file" 2>&1 || { tail -n 35 "$log_file"; exit 1; }
echo 'App Store archive: build/Transactions.xcarchive; exported IPA: build/ios/Transactions.ipa'
