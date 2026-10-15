#!/usr/bin/env bash
# Refresh JavaScript in an existing standalone simulator build; native edits need Xcode.
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
RIVL_SIMULATOR="${RIVL_SIMULATOR:-401F0520-128A-4353-9FF2-5423EEF334A8}"
RIVL_DERIVED_DATA="${RIVL_DERIVED_DATA:-/private/tmp/rivl-derived-navigation}"
RIVL_SIM_APP="$RIVL_DERIVED_DATA/Build/Products/Release-iphonesimulator/RIVL.app"
RIVL_SIM_XCENT="$RIVL_DERIVED_DATA/Build/Intermediates.noindex/RIVL.build/Release-iphonesimulator/RIVL.build/RIVL.app.xcent"
[[ -d "$RIVL_SIM_APP" && -f "$RIVL_SIM_XCENT" ]] || { echo "Build the Release simulator app with Xcode first." >&2; exit 1; }
EXPO_PUBLIC_ENABLE_DEMO=true npx expo export:embed --platform ios --dev false \
  --entry-file node_modules/expo-router/entry.js \
  --bundle-output "$RIVL_SIM_APP/main.jsbundle" --assets-dest "$RIVL_SIM_APP"
RIVL_STAGE="$(mktemp -d /private/tmp/rivl-simulator.XXXXXX)"
trap 'rm -rf "$RIVL_STAGE"' EXIT
# Stage outside Desktop so Finder cannot reattach metadata while signing.
ditto --norsrc --noextattr "$RIVL_SIM_APP" "$RIVL_STAGE/RIVL.app"
RIVL_SIM_APP="$RIVL_STAGE/RIVL.app"
xattr -cr "$RIVL_SIM_APP"
# Xcode embeds simulated entitlements in the executable. Use its signing xcent,
# not the device-like Simulated.xcent, which macOS rejects on an ad-hoc signature.
codesign --force --sign - --entitlements "$RIVL_SIM_XCENT" "$RIVL_SIM_APP"
codesign --verify --strict "$RIVL_SIM_APP"
xcrun simctl install "$RIVL_SIMULATOR" "$RIVL_SIM_APP"
