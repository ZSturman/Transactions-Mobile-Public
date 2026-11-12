#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ $# -ne 2 ]]; then
  echo "Usage: npm run ios:device -- DEVICE_UDID APPLE_TEAM_ID" >&2
  echo "Find the device with: xcrun devicectl list devices" >&2
  exit 2
fi
device_id="$1"
team_id="$2"
./node_modules/.bin/expo prebuild --platform ios --no-install
(cd ios && pod install)
log_file="${TMPDIR:-/tmp}/transactions-ios-build.log"
if ! xcodebuild -workspace ios/Transactions.xcworkspace -scheme Transactions \
  -configuration Release -destination "id=$device_id" \
  -derivedDataPath build/DerivedData-ios -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration "DEVELOPMENT_TEAM=$team_id" > "$log_file" 2>&1; then
  tail -n 30 "$log_file"
  echo "Full build log: $log_file" >&2
  exit 1
fi
xcrun devicectl device install app --device "$device_id" build/DerivedData-ios/Build/Products/Release-iphoneos/Transactions.app
xcrun devicectl device process launch --device "$device_id" com.zacharysturman.transactions
echo "Transactions installed and launched. Release includes its JavaScript bundle; Metro is not needed."
