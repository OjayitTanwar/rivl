# iPhone validation

## Latest physical installation — 14 October 2026

The user explicitly requested the current build on the physical phone first, superseding the earlier installation restriction. The latest Release build succeeded and was installed in place on the connected iPhone 15 (`00008120-000E05E00C81A01E`), bundle `app.rivl.training`. DeviceCtl reported successful installation and launch (process 1237); a subsequent process check confirmed RIVL remained running.

This installed build includes the current Health, Nutrition and Guided Training workspaces with separate contextual bars, the main Home/Maps/Record/Groups bar, and Creator Studio. The current JavaScript bundle is embedded in the standalone Release app; Metro is not required. Free provisioning expires **15 October 2026 at 17:27:25 IST** (`2026-10-15T11:57:25Z`).

Evidence: `/private/tmp/rivl-phone-current-build.log`, `/private/tmp/rivl-phone-install-current.json` and `/private/tmp/rivl-phone-launch-current.json`. Whole-project TypeScript, 407 tests across 62 suites, development security and 12 local migration/SQL suites passed. The 12 workspace entry pages, three enlarged frames, blank Studio draft preservation and RIVL exit were checked on the simulator; final reviewer scoring is pending.

Physical evidence establishes installation, launch and a running process only. No physical sensors, Watch, health imports, locked-screen recording/navigation, Android, hosted publishing or all-feature delivery are validated by this result. Older renderer/dependency and test statements below are historical; the current source uses Google maps with an optional disclosed Mapbox fallback, not the removed MapLibre renderer.

## Earlier validation — historical

Latest expansion (10 October): see [STRAVA-EXPANSION.md](STRAVA-EXPANSION.md) for 125 tests, eight SQL suites, phone/watch target builds, simulator terrain playback and free route-request checks. The latest Release build was installed and launched on the connected iPhone 15 / iOS 26.0.1; its process remained running. Free provisioning expires 15 October 2026. Installation/startup does not establish sensor, watch or locked-screen navigation validation. The application remains native; only the terrain map component uses a locally bundled WebView/WebGL renderer. Older evidence below is historical.

This is a native React Native iOS app. Expo generates a UIKit application with native system tabs, MapLibre Native, SQLite, Core Location background tasks and HealthKit. No WebView hosts the app.

## Local prerequisites
Install Xcode 26 or newer from the Mac App Store. Launch it once, accept its license and install an iOS Simulator runtime. The project targets iOS 16+. System Liquid Glass requires iOS 26 and an app compiled with the iOS 26 SDK. Older systems use solid native controls.

Run `npm run ios:simulator`. This sets DEVELOPER_DIR for this process without changing the Mac's global developer-directory preference. It generates the iOS project, installs CocoaPods, builds, installs and launches the simulator app.

For an iPhone, open `ios/RIVL.xcworkspace` after pod installation, choose your signing team and device, and run. MapLibre and HealthKit require this native build; Expo Go cannot run this app.

## Required native checks
- Sign up in local development mode → Run → Simulate a route → Pause → Resume → Finish → Save → activity detail.
- Force-close while paused and reopen. The recording and samples must remain.
- Run `npm run e2e:ios` with Maestro after installing the app.
- Outdoor physical iPhone: grant Always location, start a real run, lock for 15 minutes, unlock, pause/resume, finish. Confirm no missing route.
- Airplane mode: record and save, restart app, restore connectivity, retry sync; confirm one server activity and retained raw data.
- Two-hour recording: Instruments Time Profiler, Allocations, Energy Log. Memory and SQLite write cadence must stay bounded.
- Verify permission denial, Location Services off, approximate location and revoked Always access.
- Test iOS 16 solid fallback and iOS 26 native Liquid Glass. Test Reduce Transparency, Increase Contrast and largest accessibility text size; no clipped actions.
- Light/dark appearance, Reduce Motion, VoiceOver reading order and all recording controls.
- Read HealthKit HRV and heart rate with partial and denied permissions. No fabricated readiness.
- Supabase tests with separate athletes must verify raw-track isolation and privacy-zone redaction.

No physical-device or simulator test has been claimed until it is actually run. Killing the app stops OS location delivery; the journal retains collected samples so the session can be recovered. Browser test results only validate shared navigation/business logic.


## Fast standalone simulator updates

For JavaScript-only changes, run `bash scripts/refresh-ios-simulator.sh` after an initial Release simulator build. It refreshes the embedded bundle, removes Finder metadata from generated files, restores Xcode's simulator signature and installs over the existing app. Set `RIVL_SIMULATOR` to target another simulator. This development-only bundle enables local/demo accounts.

Use `RIVL.app.xcent` for signing, not `RIVL.app-Simulated.xcent` or `build/simulator.entitlements`. Xcode already embeds simulated entitlements in the executable; putting restricted device entitlements into an ad-hoc host signature causes macOS to reject launch before app code runs. Native changes still require rebuilding.
