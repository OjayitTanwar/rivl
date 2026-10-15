# Running RIVL on your iPhone with live edits

The development app loads JavaScript from Metro on your Mac. Keep both devices on the same trusted local network and allow RIVL Local Network access. The phone must have Developer Mode enabled and an Apple-signed development build installed. Expo Go does not include RIVL’s native modules.

## Standalone installation

Use a signed **Release** build when you want RIVL to open directly from its icon with no development launcher or running Mac. The Release app loads its embedded `main.jsbundle`; it does not use Metro. Changing its code requires rebuilding and installing an update.

Use the same Personal Team signing command below, replacing `-configuration Debug` with `-configuration Release`. Install `build/phone-derived/Build/Products/Release-iphoneos/RIVL.app`, then launch without a development-server URL:

```sh
xcrun devicectl device process launch \
  --device "$RIVL_IOS_DEVICE" app.rivl.training
```

This is a standalone test installation, not a TestFlight or App Store release. With the current local configuration, local accounts/demo work but cloud authentication and sync require Supabase configuration. Personal Team provisioning still expires and remote push remains unavailable. Installing an update over the same bundle identifier preserves the app container; do not uninstall to update.

## Daily editing

From the repository directory:

```sh
EXPO_PUBLIC_ENABLE_DEMO=true npx expo start --dev-client --lan --port 8082
```

Open RIVL and select the development server, or scan the terminal QR code. The Mac must stay awake and Metro must keep running. Saving TypeScript, React components and styles triggers Fast Refresh. Shake the phone to open the developer menu if you need Reload or Enable Fast Refresh. A change to native modules, entitlements or config plugins requires rebuilding the installed application.

The local development account and Explore demo do not require Supabase. They do not establish cloud signup or sync. Configure a development Supabase project separately to test those features.

## Apple Personal Team build

The current native project requests remote Push Notifications, which Apple rejected for this Personal Team. For this phone’s test build only, we generated `build/phone-personal.entitlements` from `ios/RIVL/RIVL.entitlements` with `aps-environment` removed. The normal entitlements remain unchanged; local reminders remain available. Never use this override for a distribution archive.

To regenerate that test-only file:

```sh
python3 - <<'PYCODE'
from pathlib import Path
import plistlib
source = Path("ios/RIVL/RIVL.entitlements")
entitlements = plistlib.loads(source.read_bytes())
entitlements.pop("aps-environment", None)
Path("build").mkdir(exist_ok=True)
Path("build/phone-personal.entitlements").write_bytes(plistlib.dumps(entitlements))
PYCODE
```

After setting `RIVL_APPLE_TEAM` and `RIVL_IOS_DEVICE` to your team ID and connected phone UDID, the exact signing workflow is:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
: "${RIVL_APPLE_TEAM:?Set your Apple development team ID}"
: "${RIVL_IOS_DEVICE:?Set your connected iPhone UDID}"
EXPO_PUBLIC_ENABLE_DEMO=true RCT_METRO_PORT=8082 xcodebuild \
  -workspace ios/RIVL.xcworkspace \
  -scheme RIVL \
  -configuration Debug \
  -destination "id=$RIVL_IOS_DEVICE" \
  -derivedDataPath build/phone-derived \
  DEVELOPMENT_TEAM="$RIVL_APPLE_TEAM" \
  CODE_SIGN_STYLE=Automatic \
  CODE_SIGN_IDENTITY='Apple Development' \
  CODE_SIGN_ENTITLEMENTS="$PWD/build/phone-personal.entitlements" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration build
```

Once signing succeeds, install with:

```sh
xcrun devicectl device install app \
  --device "$RIVL_IOS_DEVICE" \
  build/phone-derived/Build/Products/Debug-iphoneos/RIVL.app
```

Free provisioning expires; if iOS stops opening the development build, sign and install it again. Do not delete the app to refresh provisioning: uninstalling can remove local workouts. If iOS displays an untrusted-developer prompt, follow its Settings instructions for your own Apple development identity.

## Troubleshooting

- **Cannot connect to Metro:** keep Mac and phone on the same network, allow RIVL Local Network access, and ensure the server uses `--lan` instead of `--localhost`. Check VPN/firewall rules rather than disabling security globally.
- **Keychain error -34018:** install a properly signed build with application-identifier/keychain entitlements. Do not work around it by storing credentials or the database key in plaintext.
- **Native module missing:** rebuild; reloading JavaScript cannot add native code to an installed binary.
- **Filesystem watcher warnings under Pods:** `metro.config.js` excludes native build products and CocoaPods framework folders while retaining app and dependency JavaScript.

References: [Expo local development](https://docs.expo.dev/guides/local-app-development/), [iOS Developer Mode](https://docs.expo.dev/guides/ios-developer-mode/).
