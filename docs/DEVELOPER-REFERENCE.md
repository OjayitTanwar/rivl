# RIVL
A native iOS and Android social training app built with Expo SDK 55, React Native and strict TypeScript. The primary deliverable is the iPhone app.

## Run on iPhone Simulator
Install **Xcode 26+** from the Mac App Store, open it once, and install an iOS runtime. Then:
```sh
npm ci
npm run ios:simulator
```
For a physical iPhone, open `ios/RIVL.xcworkspace` after CocoaPods installation and choose your Apple signing team. **Expo Go is not supported**: MapLibre Native, HealthKit and background recording need the included native development build.

See [iPhone live-edit setup](docs/IPHONE-LIVE-EDITS.md) for the Metro workflow and the Personal Team development build that omits unsupported remote push notifications.

## Configuration
Copy `.env.example` to `.env` and configure your hosted Supabase URL and public key. No demo account or simulated cloud community is enabled. Native credentials use SecureStore. See [current installation](INSTALL.md) and [hosted setup](HOSTED-BACKEND.md) for release-preview instructions.

## Verification
```sh
npm run typecheck
npm test
npm run ios:prepare
npm run ios:bundle
npm run ios:check
npm run e2e:ios
```
Native E2E uses Maestro and an installed iPhone Simulator build. The earlier shared-runtime browser checks are retained as `npm run e2e:shared`; they do not validate native APIs.

## Architecture
- `app/`: Expo Router screens and native system tabs.
- `src/ui/`: reusable system-type primitives, Trace route artwork, native map and Liquid Glass control adapters.
- `src/domain/`: pure deterministic GPS processing, analytics, privacy, segmentation and progression.
- `src/services/`: native background location, HealthKit/Health Connect, coach narration, notifications, social services and durable sync.
- `src/storage/`: native SQLite WAL recording journal; raw samples are separate from summaries and display polylines.
- `supabase/`: PostGIS migration, RLS, server route redaction, private media storage and Realtime publication.
- `tests/`, `.maestro/`: calculation/sync regression checks and native E2E flows.

## Data and methods
Distance is a spherical haversine calculation with accuracy and implausible-speed filtering. Moving time excludes stationary samples; manual pauses and GPS gaps are not bridged. Splits interpolate distance crossings; best efforts exclude discontinuities. HR load uses zone-weighted minutes when enough HR is available, otherwise duration × session RPE. Fitness/fatigue use 42/7-day exponential decay including rest days. Race predictions use Riegel extrapolation, are estimates, and are not validated predictions. Grade-adjusted pace is a labeled heuristic, not a proprietary algorithm. The coach narrates structured facts and does not calculate metrics.

GPS is written in batches. Saving preserves full samples and a simplified display route. Sync is idempotent by activity UUID and revision, retains local data on failure, backs off retries, and isolates queues by athlete. Force-quitting stops location delivery; already-written data survives.

## Backend
Apply all current migrations with Supabase CLI to your own development project, then configure Auth redirect `rivl://auth`. The schema separates owner-only activities/tracks from the server-redacted social projection. Shared routes omit a 200 m radius around start/finish and every configured privacy zone. Private media uses a private Storage bucket. Never grant raw-track reads publicly. Run `supabase/tests/security.sql` and `supabase/tests/sync_privacy.sql` against a disposable migrated development database.

## Release status
See [implementation evidence and remaining scope](docs/IMPLEMENTATION-STATUS.md) and [iOS validation](docs/IOS-VALIDATION.md) for actual device gates. This repository is an implementation under validation, not an App Store release. Xcode, signing, a deployed Supabase project, physical-device background tests and release review are required. App Store privacy disclosures, service credentials and production map quotas belong to the deployer.

API references: [Expo Location](https://docs.expo.dev/versions/v55.0.0/sdk/location/), [native tabs](https://docs.expo.dev/versions/v55.0.0/sdk/router/native-tabs/), [Liquid Glass](https://docs.expo.dev/versions/v55.0.0/sdk/glass-effect/), [MapLibre Native](https://maplibre.org/maplibre-react-native/docs/setup/expo/).


## Production security and store readiness

Read [the researched implementation guide](docs/PRODUCTION-SECURITY-GUIDE.md) for the exact storage, lifecycle, TLS/pinning, validation, profiling and submission procedures, complete security-module source, and unverified release gates.

Run `npm run security:check` for development configuration and `npm run security:release` with real production environment values before release builds. The latter deliberately fails without configured services and an operated current/backup API pin pair. This is not a security certification.

SQLCipher and `RivlPrivateFiles` require a **new native build and fresh CocoaPods installation**. An older development binary cannot open the new protected storage path. Existing plaintext databases are retained until migration verification succeeds. The earlier automatic encryption-export exemption declaration was removed; complete App Store Connect’s encryption assessment for this build.
