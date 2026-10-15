# RIVL production hardening guide

Research and implementation: 8 October 2026. Scope: the existing Expo 55 / React Native application in this directory. This is an implementation guide and an evidence record, not a security certification or store approval. No audit establishes “zero security flaws.”

## 1. The Tactical Concept

RIVL has two different security/lifecycle needs. A workout must keep writing while the phone is locked; a cloud refresh token should only be accessible when the user has unlocked the phone. Applying biometric authentication to both would break background recording. The implementation therefore separates a protected recording database from foreground authentication storage.

The recording database is authoritative during a workout. React state is a disposable view of that database. Supabase is authoritative for cloud identity, permissions and shared data. Neither a cached session object nor a client-calculated leaderboard score grants server access. This prevents a UI crash, expired JWT or airplane mode from discarding recorded work.

The concrete file boundaries are:

| Boundary | Implementation | Purpose |
| --- | --- | --- |
| Local workout data | `src/storage/encrypted.ts`, `database.ts` | SQLCipher opening/migration; transactional GPS writes |
| OS protection | `src/security/auth-storage.ts`, `private-files.ts`, `modules/rivl-private-files/ios/` | Keychain/Keystore credentials; iOS Documents backup exclusion and file protection |
| Network | `src/security/transport.ts`, `services/supabase.ts`, `plugins/with-native-security.js` | API origin checks, aborts/timeouts, platform TLS configuration and optional real SPKI pins |
| Input/output boundaries | `src/security/validation.ts`, `errors.ts`, `diagnostics.ts` | Validate before writes; show controlled errors; minimize diagnostics |
| Lifecycle | `services/recorder-engine.ts`, `recording.ts`, `state/store.tsx` | Durable state machine, serialized ingestion, one foreground refresh lifecycle |
| Server validation | `supabase/migrations/202610080002_input_bounds.sql` | Database constraints apply even to modified clients |
| Release gate | `scripts/security-preflight.mjs` | Reject missing production configuration, demo authentication and unsafe public keys |

Implemented in this pass: encrypted database integration, migration guards, credential accessibility options, native TLS/backup configuration, a local Swift protection module, validation in auth/profile/comment/activity/route flows, account ownership checks, single-flight sync and recording reads, delayed auth callback work, memory-warning preview eviction, safer UI errors, keyboard insets, and telemetry minimization. There are no invented production certificates or API credentials. Existing development fixtures remain explicitly labeled and production builds must disable them.

Limits: native Swift/SQLCipher behavior, certificate enforcement, real backend policies and physical-device energy have not been verified. The app still loads its historical activity metadata into provider memory; rendering virtualization alone does not resolve that scaling limit. Account deletion, reporting and blocking now have connected client/server implementations; deployment, final adversarial testing, filtering and moderation operations remain incomplete. See IMPLEMENTATION-STATUS.md for current execution evidence. The blueprint below distinguishes these remaining work items from the code already connected to RIVL.

## 2. The "How-To" Blueprint

### A. Native hierarchy, text and navigation

1. Keep the root `SafeAreaProvider` above the native stack. The signed-out branch leads to `auth`; successful authentication replaces it with the five native tabs. Activity detail pushes onto the stack; Settings presents as a modal. Back from an activity returns to its originating tab. Switching tabs must never stop a recording.
2. On each screen, place a semantic title, primary action, headline measurements and supporting analysis in that order. Keep the Record pause/finish controls above secondary metrics. Give controls at least 44 pt on iOS and 48 dp on Android. RIVL's reusable buttons use a minimum height, not a fixed height; their labels now wrap.
3. Assign each inset one owner. `Screen` currently owns the top safe area and requests automatic scroll insets. The native tab controller supplies its bottom inset. Verify the actual `adjustedContentInset` in Xcode's View Debugger before changing these together; double application creates a large blank strip. The current 110-point bottom content padding is a conservative spacing value, not a measurement of the tab bar. Replace it with ordinary 24-point content spacing once the native tab inset is confirmed; standalone stack screens need their bottom safe inset. History needs its FlatList safe-area handling reviewed independently because its header contains `Screen`.
4. Use system fonts, `allowFontScaling`, tabular metric digits and content-sized containers. At accessibility text sizes, switch multi-column metric rows to a vertical stack when they no longer fit; do not silently cap font scaling to preserve a screenshot. Read long names and values with VoiceOver/TalkBack. Check that the title and unit remain associated and that selected segments announce their state.
5. `Screen` now enables automatic keyboard insets and interactive keyboard dismissal. Test signup and workout notes with the keyboard visible: the submit action must remain reachable, scrolling must not dismiss typed text, and a second tap must not start a duplicate mutation.
6. Use the existing system `GlassView` only for controls on supported iOS versions. Ordinary content remains solid. Test Reduce Transparency and Increase Contrast independently, alongside dark mode; `GlassControl` falls back to a solid surface. Native tab behavior must also be checked on the device, not inferred from that wrapper.

These are RIVL implementation decisions informed by Apple's [layout guidance](https://developer.apple.com/design/human-interface-guidelines/layout) and [accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility). They are not a substitute for native layout inspection.

### B. Recording state, suspension and recovery

The persisted `Recording.state` is the state machine; route preview points and screen timers are not.

| Event | Durable transition and order | Recovery rule |
| --- | --- | --- |
| Start | Obtain permissions; atomically write active session plus blank stats; attach native location task | If task attachment fails, report failure and remove the new unused session |
| GPS batch | Serialize on the recorder queue; validate/sort fixes; commit fixes, counters and session together | A failed transaction must not advance counters; replaying timestamps must not double-count |
| Pause | Queue behind ingestion; persist `paused`; stop the source | Late batches observe `paused` and are ignored |
| Resume | Persist `recording`, increment segment and set acceptance time; restart source | Failure returns to `paused`; stale fixes cannot bridge the pause |
| Finish | Persist `saving` and stable end time; stop native source | Reopening the app returns to the save form |
| Save | Validate fields/owner; process preserved raw points; persist activity; remove active marker | A pending activity is reconciled into the durable sync outbox even if the process dies before enqueue |
| Discard | Require an explicit user action; stop source; remove active marker, raw track and stats | Never invoke discard because of network, token or memory failure |

Implementation steps:

1. Keep `TaskManager.defineTask` at module scope in `services/recording.ts`, loaded from the root before navigation. Native location delivery invokes `engine.ingest`; it does not call a mounted component.
2. Send GPS batches to `commitSamples`. It uses `withExclusiveTransactionAsync`, bound SQL parameters and WAL with `synchronous=FULL`. Await completion before acknowledging progress. Do not buffer an entire workout until `AppState` changes: the OS can suspend or kill the process without a final callback.
3. Stop Supabase automatic refresh when leaving the foreground. Keep local recording active. On return, reattach the same athlete's recording, reload local data, then attempt sync. Auth callback work is deferred to a timer and timers/listeners are removed on cleanup.
4. On an iOS memory warning, discard only the bounded route preview. The next foreground poll reconstructs it from indexed samples. Never clear raw GPS, saved activities, auth tokens or the outbox in response to memory pressure. Android JS `memoryWarning` delivery is not assumed; keep allocations bounded proactively.
5. Explicitly test process termination between each durable write. The current save sequence is recoverable through pending-activity reconciliation, but a crash before removing the active marker can reopen the same save form. Re-saving uses the same activity ID. Verify the final summary and revision rather than only checking that a row exists.
6. Do not promise uninterrupted capture after a user force-quits the app, revokes location or reboots without unlocking. Preserve existing points, show the gap on recovery, and never connect distant fixes with a fabricated route segment.

Reference APIs: [React Native AppState](https://reactnative.dev/docs/appstate), [Supabase foreground auto-refresh](https://supabase.com/docs/reference/javascript/auth-startautorefresh), [Expo SQLite](https://docs.expo.dev/versions/v55.0.0/sdk/sqlite/).

### C. Protected persistence, biometrics and hardware claims

1. Authentication uses `expo-secure-store`: iOS Keychain generic-password items, Android Keystore-protected storage. `auth-storage.ts` sets `WHEN_UNLOCKED_THIS_DEVICE_ONLY` for iOS credentials. Supabase receives this adapter directly; JWTs must never be copied into AsyncStorage, telemetry or the activity database. Its cached `Session` contains only identity and development-mode metadata.
2. Generate the database key once from 32 cryptographically random bytes. Save it through SecureStore before creating the encrypted database. Use `AFTER_FIRST_UNLOCK` without biometric authentication so a background workout can write after screen lock. This iOS accessibility class is not a biometric requirement or a universal hardware-attestation guarantee. Database files are excluded from backup; the key is separate from them.
3. Enable `useSQLCipher` in the Expo SQLite plugin and rebuild the native binary. At runtime, require a nonempty `PRAGMA cipher_version`; apply the hex key before accessing schema/data. Fail closed on missing key or unsupported binary. Do not regenerate a key when a database already exists.
4. Upgrade plaintext data by opening the old database, checkpointing WAL, attaching a new encrypted file, exporting, comparing row counts, writing a completion marker and committing. Reopen and run integrity verification before deleting the old database and sidecars. An interrupted export without its marker is replaced from the preserved source. If the target cannot be opened at all, retain files and stop; do not guess that deletion is safe. Flash-storage deletion cannot guarantee forensic erasure of historical plaintext blocks; encrypted storage is strongest from first installation.
5. The Swift module excludes Documents from iCloud/device backups and applies `completeUntilFirstUserAuthentication` to its private directory. Existing photo files should be inspected for their actual protection class during upgrade testing; the module does not recursively rewrite every legacy file. Android sets `allowBackup=false` plus explicit cloud/device-transfer exclusions. The custom policy replaces SecureStore's automatic backup configuration, including its preferences.
6. A biometric dialog alone is not encryption. For a future optional foreground app lock, create a separate Keychain service with `requireAuthentication:true` and a descriptive Face ID usage string; access that item when entering the sensitive flow. Enrollment changes can invalidate it. Treat cancellation as cancellation and invalidation as requiring fresh sign-in; never fall back to plaintext. Keep the recorder key outside this policy. Do not retrofit it onto the existing refresh-token service without a tested migration and prompt schedule.
7. If the product requires proof of hardware backing on Android, inspect the actual generated key using `KeyStore.getInstance("AndroidKeyStore")`, `SecretKeyFactory.getInstance(key.algorithm,"AndroidKeyStore")`, `getKeySpec(...,KeyInfo::class.java)` and `securityLevel` on API 31+. Record only whether it is SOFTWARE, TRUSTED_ENVIRONMENT or STRONGBOX. To require StrongBox, generate a new AES/GCM key with `KeyGenParameterSpec.Builder`, `setIsStrongBoxBacked(true)` on API 28+, and explicitly handle `StrongBoxUnavailableException`. RIVL currently makes no StrongBox claim and does not add a second custom key implementation merely to claim one.
8. On iOS, Keychain is not a claim that arbitrary tokens are stored inside the Secure Enclave. Enclave APIs protect supported private keys. A requirement for an enclave-bound credential would need a separate keypair and server challenge protocol: create a permanent P-256 key with `SecKeyCreateRandomKey`, `kSecAttrTokenIDSecureEnclave`, private-key usage access control; register only the public key; sign fresh server nonces with `SecKeyCreateSignature`; verify server-side and reject nonce replay. That protocol is not implemented here and is not needed to mislabel JWT storage as “enclave storage.”

Android's `EncryptedSharedPreferences` is deprecated, so introducing it now would contradict current platform direction. See [Android security-crypto release notes](https://developer.android.com/jetpack/androidx/releases/security), [Keystore security levels](https://developer.android.com/privacy-and-security/keystore), [Expo SecureStore behavior and biometric invalidation](https://docs.expo.dev/versions/latest/sdk/securestore/), [Apple Secure Enclave keys](https://developer.apple.com/documentation/security/protecting-keys-with-the-secure-enclave), and [SQLCipher plaintext migration](https://www.zetetic.net/sqlcipher/encrypting-plaintext-databases/).

### D. HTTPS, SPKI pinning and token refresh

1. Keep all API requests on the configured HTTPS origin. `apiFetch` rejects credentials in URLs and cross-origin destinations before invoking fetch. It forwards caller cancellation, imposes a 25-second fetch deadline and always removes timers/listeners. HTTP status responses remain available to Supabase for its error handling. It deliberately does not replay POST requests.
2. The native plugin sets iOS ATS arbitrary loads to false and Android release cleartext to false with system trust anchors. An Android debug-only resource allows Metro HTTP; the pinned API domain remains HTTPS. iOS local-network allowance is disabled for the EAS production profile. Local archives must use the same production environment during prebuild; inspect the archive, not just app.json.
3. Pin only an endpoint whose certificate-key rotation you can operate. Obtain current and independent backup certificate/public-key material through the infrastructure owner. Do not scrape a current Supabase/CDN leaf and assume you control its future key. If the managed endpoint cannot provide an operated rotation plan, resolve that with a supported custom gateway or managed pinning agreement before enabling the release gate.
4. Given operator-provided `current-leaf.pem` and `backup-leaf.pem`, calculate SPKI hashes without exposing private keys:

```sh
openssl x509 -in current-leaf.pem -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A
openssl x509 -in backup-leaf.pem -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A
```

5. Set `RIVL_PINNED_HOST` to the exact API DNS name and `RIVL_TLS_SPKI_PINS` to the two comma-separated hashes in the build environment. They are public pins, not secrets. The plugin rejects malformed or duplicate pins and writes ATS `NSPinnedLeafIdentities` plus Android `pin-set`. It does not use a pin expiry that silently disables pinning. Neither production pins nor a certificate owner have been configured in this workspace.
6. Rebuild and test the actual request stacks: Auth, PostgREST, Storage, Realtime/WebSockets and native MapLibre. The configured API host does not pin external map providers. React Native fetch redirect behavior and WebSocket pin enforcement must be demonstrated separately; a JavaScript post-response origin check cannot undo credentials already forwarded by a native redirect. Disable any unverified cloud transport in a release candidate or route it through a validated native client. No claim of universal pin coverage is made from generated XML alone.
7. Test A+B against a valid A server, valid B server and an otherwise trusted C server. A and B must succeed; C must fail with a recoverable connection message. Ship B+C before retiring A/B as appropriate for the installed population. Retain overlapping keys until old clients are retired; never add an accept-all exception to fix an outage.
8. Let the installed Supabase Auth SDK own token persistence and refresh. RIVL starts auto-refresh only in foreground. An SDK refresh updates SecureStore and emits `TOKEN_REFRESHED`; the deferred handler attempts sync. `SIGNED_OUT` clears visible identity and the cached session marker, not local workouts. Do not add Axios interceptors around this client: two refresh coordinators can compete over rotating refresh tokens. The installed `auth-js` marks `processLock` deprecated; this implementation does not add it.
9. For revoked/expired credentials, map authentication errors to sign-in and leave outbox work pending. Keep permission errors distinct from expiry. A timeout never proves that a write failed on the server; activity retries use stable IDs/revisions and server ownership checks. Do not blindly retry signup, comments or other non-idempotent mutations. Test parallel requests during expiry against a real staging Auth service.

Apple explicitly advises careful pin rotation rather than treating pinning as a universal default: [Apple identity pinning](https://developer.apple.com/news/?id=g9ejcf8y). Platform configuration: [Android network security](https://developer.android.com/privacy-and-security/security-config). Auth lifecycle: [Supabase React Native setup](https://supabase.com/docs/guides/auth/quickstarts/react-native) and [auth state callback](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).

### E. Input validation and defensive errors

1. Validate at the first mutation boundary, not only in a text field. Names, titles, notes and comments use `textInput`: require strings, normalize NFC/newlines, trim outer whitespace, reject control/bidi-override characters and bound Unicode code points. Do not HTML-escape normal text rendered by React Native `Text`; HTML injection is not the rendering model. A future WebView would require its own output policy.
2. Preserve password bytes. Signup requires 12–128 characters; signin permits older passwords. Configure the server's password policy to match, including breached-password protection if available. Client rules alone do not secure Auth. Email validation is a usability check; confirmation email establishes control of the address.
3. Validate finite numeric values and ranges for HR, distance, privacy coordinates and radius. Require integer RPE in recording saves. IDs used as filesystem path components must match UUID syntax. Restrict appearance/visibility to explicit enums. Never authorize a write merely because an ID parses: check `session.userId === activity.ownerId`, then enforce RLS independently.
4. Bind SQL values. The SQLCipher key interpolation is restricted to exactly 64 generated/stored hex characters; normal user text goes through SQLite bind parameters. Add equivalent PostgreSQL constraints so bypassing the app still fails. The new migration rejects oversized/control-character text and invalid route bounds. Run its SQL test plus the existing cross-account RLS tests on a disposable PostGIS database. Existing invalid rows cause migration failure; inspect/correct them deliberately rather than silently truncating them.
5. Treat all remote JSON as untrusted. Profile validation is connected on cloud sign-in. A complete release also needs runtime decoders and body-size limits for every imported activity, media response and sensor adapter; TypeScript casts are not runtime validation. Reject invalid records individually and retain the last good local data; do not replace the cache with a malformed response.
6. Convert caught errors using `failure`/`userMessage`. Known `AppFailure` messages are authored UI copy. Unknown server bodies are not shown. Offline/timeouts expose retry; auth failures instruct signin; disk-full explains how to free space; a missing encryption key stops opening without overwriting files. Button handlers release their pending lock in `finally`.
7. Keep content during refresh. Initial boot uses a loading indicator; an empty successful query uses `Empty`; a failed query uses `Notice` and a retry that returns the Promise to the shared Button. Do not display an empty history because a request failed. The boot retry now reruns initialization rather than clearing the error with an uninitialized session.
8. A render error boundary cannot catch native process crashes or all asynchronous errors. Keep explicit catches around database/network tasks. The recorder task catches write failures and reports diagnostics, but physical storage-fault testing must verify how promptly recording UI exposes a failed write; no “never crashes” claim is justified.
9. Telemetry receives a newly created categorical error, never the original message/context. The Sentry hook removes request/user/extras/contexts, messages and breadcrumbs and minimizes frames. Sampling alone is not redaction. Exercise a deliberate error containing a test token/coordinate, capture the transmitted event and search for those values. Native crash attachments and vendor-side retention need separate review.

### F. Performance, leaks, images and large histories

1. Build a Release binary for baseline performance; keep a separate development build for React profiling. In Xcode, choose Product → Profile → Time Profiler and record a start/pause/resume/save sequence plus rapid tab changes. Identify main-thread stacks separately from Hermes/JS processing. At 60 Hz a frame is about 16.7 ms; at 120 Hz about 8.3 ms. These are frame intervals, not permission to consume all of them in application code.
2. Open Allocations, mark a generation, enter/leave activity detail 20 times, then repeat after a quiet interval. Compare persistent allocations between equivalent points. Use Memory Graph to find retained map views, subscriptions, timers and closures. Remove the owning subscription in effect cleanup, clear interval handles, release native resources when their view unmounts, and rerun the same sequence. A cache plateau differs from monotonic retained growth.
3. Use Leaks and Main Thread Checker; run Thread Sanitizer in a supported simulator configuration for native races. On Android use [Android Studio heap dumps](https://developer.android.com/studio/profile/capture-heap-dump) and CPU/System Trace, inspect retained Activities and native map resources, and repeat on a lower-memory device. Save trace files and exact build/device identifiers with results.
4. RIVL already commits short GPS batches, queries by timestamp, updates preview geometry approximately every five foreground seconds, caps it around 1,600 points, and samples long charts to 512 points. Full-resolution fixes remain in SQL. The new single-flight read avoids overlapping asynchronous polls. Increasing timestamp limits is not a performance strategy.
5. Heavy final processing still runs synchronously in JavaScript. Measure a four-hour and a day-long track on the slowest supported device. If it causes long JS tasks, move processing into an Expo native module on a dedicated worker queue with a cancellable job ID, or refactor the deterministic processor into chunks that yield between bounded work units. Merely marking a function `async`, calling `setTimeout` once or showing a spinner does not move CPU work off-thread. Compare the output against the same calculation fixtures before replacing the processor.
6. History currently uses `FlatList`, stable activity IDs, an initial render batch of 12, subsequent batches of 10 and a window of 7. Do not nest it in a same-direction ScrollView. Do not set `getItemLayout` to a guessed constant when Dynamic Type changes row height. Memoize an expensive row only when props remain stable; profile before introducing a custom comparator.
7. The next storage scaling change is explicit: add an indexed activity-summary table with `(owner_id, started_at DESC, id DESC)`; backfill it transactionally; query 50 rows with `(started_at,id) < (?,?)`; keep full display routes in a separate detail table; load routes only for visible details/maps; compute daily aggregates for dashboards. Keep the existing KV records until migration parity is verified. `StoreProvider` currently reads all history metadata, so the app is not yet proven smooth with thousands of activities despite FlatList virtualization.
8. Photo handling still needs bounded decoding/caching. At import, decode off the JS thread, strip EXIF/location metadata, resize a thumbnail and an upload rendition to documented pixel/byte limits, and store both under the protected photos directory. Keep originals only if the user explicitly needs them. Cache private images by owner/activity/revision, invalidate on sign-out/privacy changes, and cap disk/memory usage. Signed URLs must not be cache identity or telemetry. The present media adapter copies a selected file; it does not yet strip EXIF or provide a bounded thumbnail pipeline. Until implemented and tested, private photos must not be promoted into public community media.
9. Compare real battery drain, wakeups and GPS accuracy during a multi-hour locked-screen workout with and without the map visible. Record thermal state, device, OS and permissions. Simulator throughput tests cannot establish energy efficiency.

References: [React Native performance](https://reactnative.dev/docs/performance), [FlatList configuration](https://reactnative.dev/docs/optimizing-flatlist-configuration), [Apple memory investigation](https://developer.apple.com/documentation/Xcode/gathering-information-about-memory-use), [Apple runtime diagnostics](https://developer.apple.com/documentation/xcode/diagnosing-memory-thread-and-crash-issues-early).

### G. Configuration, repository history and release workflow

1. Keep API URL, publishable Supabase key, public Sentry DSN and map style URL in environment configuration. `EXPO_PUBLIC_*` is bundled and readable by anyone. A `.env` file or obfuscated build constant cannot conceal a server credential. Keep service-role keys, signing credentials and third-party secret API keys in server/build secret stores, with separate development/staging/production values. [Expo environment behavior](https://docs.expo.dev/guides/environment-variables/).
2. `.gitignore` now excludes `.env`, `.env.*`, signing keys/profiles and permits only `.env.example`. The preflight reads the same environment-file convention and rejects obvious private/secret public-variable names and secret Supabase keys. It does not prove arbitrary strings are safe or scan history.
3. This directory is not currently a Git repository. There is no history to certify. Once a repository exists, install a trusted release of [Gitleaks](https://github.com/gitleaks/gitleaks), run `gitleaks git --redact` over the history and `gitleaks dir --redact` over the working copy, review filenames without printing secrets, and add the checks to CI before build/upload. Also run `git ls-files` for environment/key files; ignored files already tracked remain tracked.
4. If a real secret was committed, revoke/rotate it first, redeploy consumers, and inspect provider access logs. Removing it from the latest file is insufficient. Coordinate any history rewrite with repository owners because it changes commit identities; invalidate cached artifacts and check forks/backups separately. Do not automate a destructive history rewrite as part of a routine build.
5. Run `npm run typecheck`, `npm test`, `npm run security:check`, then production preflight with actual release configuration. Generate native projects again. After Xcode installation/first launch and simulator runtime setup, run `npm run ios:simulator`; it regenerates the project, installs pods and launches. Android needs a configured SDK/emulator or attached device before `npm run android`.
6. Do not ship an OTA JavaScript update that starts using SQLCipher or the new Swift module on an older binary. This change requires a new native build/runtime. Re-run pods even if an earlier workspace already had dependencies installed.
7. SQLCipher adds encryption beyond the operating system transport APIs. The previous unconditional `ITSAppUsesNonExemptEncryption=false` setting has been removed. Answer App Store Connect’s encryption questions for the actual distribution and upload documentation if required; do not guess the exemption. Follow [Apple’s encryption documentation workflow](https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation).
8. Run dependency advisory review, inspect lockfile changes, and rebuild using compatible Expo versions. Do not blindly use `npm audit fix --force` across native dependencies. Archive reproducible dependency versions and build provenance with the release evidence.

### H. Store blockers: exact remaining implementation paths

**Account deletion — implemented, awaiting deployment and final validation.** Add You → Settings → Account → Delete account. Explain unsynced-workout loss and require reauthentication, with an explicit final destructive confirmation. Send an authenticated request to a server deletion service; verify the JWT server-side and derive the user ID from it, never from a body field. Create a durable, idempotent deletion job; prevent new uploads; enumerate/delete the user's Storage objects through the Storage API; remove social content and account data; delete the Auth identity last using a server-only admin credential. Retry partial jobs after outages and expose deletion status. After confirmed completion, stop any recorder, remove that athlete's local records/photos/credential state and return to signup. Test partial Storage failure, repeated requests, recent-login expiry and account switching. Add a public web request entrypoint for Play and ensure it reaches the same verified workflow. Apple requires in-app initiation for account-creating apps; Google also specifies an external deletion path. [Apple account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion), [Google deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

**Community safety — reporting/blocking implemented; filtering and operations incomplete.** Add Report activity/comment and Block athlete to contextual menus. Persist reports in a private table visible only to the reporter and moderation staff; enforce reason length, target existence, per-account rate limits and idempotency. Persist blocks with an owner-only insert/delete policy. Enforce block visibility in publication/comment/profile queries and server write policies, not just a client filter; remove cached blocked content immediately. Add a moderation queue with staff access separate from the mobile key, response procedures and an in-app support contact. Test that a modified client cannot read blocked content or forge moderation decisions. Community must not be enabled for public release until filtering, reporting, blocking and operational response exist. See UGC requirements in [Apple's review guidelines](https://developer.apple.com/app-store/review/guidelines/).

**Privacy and permission disclosures — incomplete.** Publish an accurate privacy policy describing precise location, health, photos, account identifiers, crash reports, retention and deletion. Inventory each SDK's actual outbound data, then complete Apple privacy labels/required-reason declarations and Play Data Safety from that inventory. Display an in-app background-location explanation before the OS permission request, including use while the screen is locked; request foreground first and background only when starting a workout. Let the user deny health access and still record GPS. Explain each requested HealthKit/Health Connect data type and use only those needed. Provide review credentials and a working backend; do not rely on the local demo account as production authentication. [Play background location](https://support.google.com/googleplay/android-developer/answer/9799150), [Play health apps](https://support.google.com/googleplay/android-developer/answer/18258653).

## 3. Production-Ready Code

The source below is the complete implementation of the new security modules, encryption path, native plugin and preflight, copied from the repository rather than pseudocode. “Production-ready” here describes the intended implementation standard, not a claim that these uncompiled native changes are approved for release. The modules are connected to existing application flows; native and backend validation remain mandatory. The companion source files are canonical if later edited.

### `src/security/auth-storage.ts`

```ts
import * as SecureStore from "expo-secure-store";
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};
export const authStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key, options),
  setItem: (key: string, value: string) =>
    SecureStore.setItemAsync(key, value, options),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key, options),
};
```

### `src/security/private-files.ts`

```ts
import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { AppFailure } from "./errors";
let preparing: Promise<void> | null = null;
export function preparePrivateFiles(): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  if (!preparing) {
    const native = requireOptionalNativeModule<{ prepare(): Promise<void> }>(
      "RivlPrivateFiles",
    );
    if (!native)
      return Promise.reject(
        new AppFailure(
          "storage",
          "Rebuild RIVL to enable protected workout files.",
        ),
      );
    preparing = native.prepare().catch((error) => {
      preparing = null;
      throw error;
    });
  }
  return preparing;
}
```

### `modules/rivl-private-files/expo-module.config.json`

```json
{
  "platforms": ["apple"],
  "apple": { "modules": ["RivlPrivateFilesModule"] }
}
```

### `modules/rivl-private-files/ios/RivlPrivateFiles.podspec`

```ruby
Pod::Spec.new do |s|
  s.name = 'RivlPrivateFiles'
  s.version = '1.0.0'
  s.summary = 'RIVL private workout file protection'
  s.description = 'Applies iOS file protection and backup exclusion to the app document directory.'
  s.license = { :type => 'Proprietary' }
  s.author = 'RIVL'
  s.homepage = 'https://expo.dev'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.0' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
```

### `modules/rivl-private-files/ios/RivlPrivateFilesModule.swift`

```swift
import ExpoModulesCore
import Foundation

public final class RivlPrivateFilesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RivlPrivateFiles")

    AsyncFunction("prepare") {
      let files = FileManager.default
      var documents = try files.url(for: .documentDirectory, in: .userDomainMask,
                                    appropriateFor: nil, create: true)
      var resourceValues = URLResourceValues()
      resourceValues.isExcludedFromBackup = true
      try documents.setResourceValues(resourceValues)

      // A locked screen must not make an ongoing workout unwritable after first unlock.
      try files.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                              ofItemAtPath: documents.path)
      for directory in ["SQLite", "photos"] {
        let root = documents.appendingPathComponent(directory, isDirectory: true)
        try files.createDirectory(at: root, withIntermediateDirectories: true,
                                  attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
      }
    }
  }
}
```

### `src/storage/encrypted.ts`

```ts
import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import * as Files from "expo-file-system/legacy";
import { AppFailure } from "../security/errors";
import { preparePrivateFiles } from "../security/private-files";
const oldName = "rivl-v1.db";
const name = "rivl-private-v2.db";
const keyName = "rivl.database.key.v2";
const marker = "encryption:migration-complete";
const keyOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  requireAuthentication: false,
};
const path = (file: string) => `${SQLite.defaultDatabaseDirectory}/${file}`;
const uri = (file: string) =>
  path(file).startsWith("file:") ? path(file) : "file://" + path(file);
const exists = async (file: string) =>
  (await Files.getInfoAsync(uri(file))).exists;
const literal = (value: string) => "'" + value.replace(/'/g, "''") + "'";
async function ensureCipher(db: SQLite.SQLiteDatabase) {
  const version = await db.getFirstAsync<{ cipher_version: string }>(
    "PRAGMA cipher_version",
  );
  if (!version?.cipher_version)
    throw new AppFailure(
      "storage",
      "This version needs a new native build to open encrypted workouts. Rebuild RIVL and retry.",
    );
}
async function unlock(key: string) {
  const db = await SQLite.openDatabaseAsync(name);
  try {
    await ensureCipher(db);
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.getFirstAsync("SELECT count(*) FROM sqlite_master");
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
async function cleanupPlaintext() {
  if (await exists(oldName)) await SQLite.deleteDatabaseAsync(oldName);
  for (const suffix of ["-wal", "-shm", "-journal"])
    await Files.deleteAsync(uri(oldName + suffix), { idempotent: true });
}
async function migrate(key: string) {
  const source = await SQLite.openDatabaseAsync(oldName, {
    useNewConnection: true,
  });
  let attached = false;
  try {
    await ensureCipher(source);
    await source.execAsync("PRAGMA wal_checkpoint(TRUNCATE)");
    await source.execAsync(
      `ATTACH DATABASE ${literal(path(name).replace(/^file:\/\//, ""))} AS encrypted KEY "x'${key}'";`,
    );
    attached = true;
    await source.execAsync("BEGIN EXCLUSIVE");
    try {
      await source.getFirstAsync("SELECT sqlcipher_export('encrypted')");
      const before = await source.getFirstAsync<{ kv: number; gps: number }>(
        "SELECT (SELECT count(*) FROM main.kv) AS kv,(SELECT count(*) FROM main.gps) AS gps",
      );
      const after = await source.getFirstAsync<{ kv: number; gps: number }>(
        "SELECT (SELECT count(*) FROM encrypted.kv) AS kv,(SELECT count(*) FROM encrypted.gps) AS gps",
      );
      if (
        !before ||
        !after ||
        before.kv !== after.kv ||
        before.gps !== after.gps
      )
        throw new AppFailure(
          "storage",
          "Encrypted migration did not verify. Your original workouts have been retained.",
        );
      await source.runAsync(
        "INSERT OR REPLACE INTO encrypted.kv(key,value) VALUES(?,?)",
        marker,
        "true",
      );
      await source.execAsync("PRAGMA encrypted.user_version=1; COMMIT");
    } catch (error) {
      await source.execAsync("ROLLBACK");
      throw error;
    }
  } finally {
    try {
      if (attached) await source.execAsync("DETACH DATABASE encrypted");
    } finally {
      await source.closeAsync();
    }
  }
}
export async function openEncryptedDatabase(): Promise<SQLite.SQLiteDatabase> {
  await preparePrivateFiles();
  const plaintextExists = await exists(oldName);
  const encryptedExists = await exists(name);
  let key = await SecureStore.getItemAsync(keyName, keyOptions);
  if (!key && encryptedExists)
    throw new AppFailure(
      "storage",
      "The encryption key is unavailable. Unlock the device and retry. RIVL will not overwrite your workouts.",
    );
  if (!key) {
    key = Array.from(await Crypto.getRandomBytesAsync(32), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    await SecureStore.setItemAsync(keyName, key, keyOptions);
  }
  if (!/^[a-f0-9]{64}$/.test(key))
    throw new AppFailure(
      "storage",
      "The stored encryption key is invalid. Workouts have not been modified.",
    );
  if (plaintextExists) {
    let complete = false;
    if (encryptedExists) {
      const candidate = await unlock(key);
      try {
        const table = await candidate.getFirstAsync(
          "SELECT name FROM sqlite_master WHERE name='kv'",
        );
        complete =
          !!table &&
          !!(await candidate.getFirstAsync(
            "SELECT key FROM kv WHERE key=?",
            marker,
          ));
      } finally {
        await candidate.closeAsync();
      }
      if (!complete) await SQLite.deleteDatabaseAsync(name);
    }
    if (!complete) await migrate(key);
  }
  const db = await unlock(key);
  try {
    if (plaintextExists) {
      const check = await db.getFirstAsync<{ integrity_check: string }>(
        "PRAGMA integrity_check",
      );
      if (check?.integrity_check !== "ok")
        throw new AppFailure(
          "storage",
          "Database verification failed. RIVL has preserved the existing files for recovery.",
        );
      await cleanupPlaintext();
    }
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
```

### `src/security/transport.ts`

```ts
import { AppFailure } from "./errors";
export function apiFetch(
  baseUrl: string,
  transport: typeof fetch = fetch,
  timeoutMs = 25000,
): typeof fetch {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new AppFailure(
      "validation",
      "The API must use an HTTPS URL without embedded credentials.",
    );
  return async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    if (url.origin !== base.origin || url.username || url.password)
      throw new AppFailure(
        "forbidden",
        "The request destination is not allowed.",
      );
    const controller = new AbortController();
    const source =
      init?.signal ??
      (typeof Request !== "undefined" && input instanceof Request
        ? input.signal
        : null);
    const cancel = () => controller.abort();
    if (source?.aborted) cancel();
    else source?.addEventListener("abort", cancel, { once: true });
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      controller.abort();
    }, timeoutMs);
    try {
      if (controller.signal.aborted)
        throw new AppFailure("cancelled", "The request was cancelled.");
      const response = await transport(input, {
        ...init,
        signal: controller.signal,
        redirect: "error",
      });
      if (response.url && new URL(response.url).origin !== base.origin)
        throw new AppFailure(
          "forbidden",
          "The service redirected to an unexpected destination.",
        );
      return response;
    } catch (error) {
      if (expired)
        throw new AppFailure(
          "timeout",
          "The connection timed out. Retry when you have a stable connection.",
          true,
        );
      if (source?.aborted)
        throw new AppFailure("cancelled", "The request was cancelled.");
      throw error;
    } finally {
      clearTimeout(timer);
      source?.removeEventListener("abort", cancel);
    }
  };
}
```

### `src/services/supabase.ts`

```ts
import { createClient } from "@supabase/supabase-js";
import { authStorage } from "../security/auth-storage";
import { apiFetch } from "../security/transport";
import { config, backendConfigured } from "./config";
import { AppFailure } from "../security/errors";
export let configurationError: AppFailure | null = null;
function configuredClient() {
  if (!backendConfigured) {
    if (config.supabaseUrl || config.supabaseKey || !config.demoEnabled)
      configurationError = new AppFailure(
        "validation",
        "RIVL’s cloud configuration is incomplete. Install a correctly configured build.",
      );
    return null;
  }
  try {
    return createClient(config.supabaseUrl, config.supabaseKey, {
      global: { fetch: apiFetch(config.supabaseUrl) },
      auth: {
        storage: authStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: "pkce",
      },
    });
  } catch {
    configurationError = new AppFailure(
      "validation",
      "RIVL’s cloud configuration is invalid. Install a correctly configured build.",
    );
    return null;
  }
}
export const supabase = configuredClient();
```

### `src/security/validation.ts`

```ts
import { AppFailure } from "./errors";
import type { PrivacyZone, Profile } from "../domain/types";
const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
export function textInput(
  value: unknown,
  label: string,
  max: number,
  required = true,
): string {
  if (typeof value !== "string")
    throw new AppFailure("validation", `${label} must be text.`);
  const text = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (controls.test(text) || /[\u202A-\u202E\u2066-\u2069]/u.test(text))
    throw new AppFailure(
      "validation",
      `${label} contains unsupported control characters.`,
    );
  if ((required && !text) || [...text].length > max)
    throw new AppFailure(
      "validation",
      `${label} must contain ${required ? "1" : "0"}–${max} characters.`,
    );
  return text;
}
export function emailInput(value: unknown): string {
  const email = textInput(value, "Email", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new AppFailure("validation", "Enter a valid email address.");
  const at = email.lastIndexOf("@");
  return email.slice(0, at) + email.slice(at).toLowerCase();
}
export function passwordInput(value: unknown, signup: boolean): string {
  if (
    typeof value !== "string" ||
    value.length < (signup ? 12 : 1) ||
    value.length > 128
  )
    throw new AppFailure(
      "validation",
      signup
        ? "Use 12–128 characters for your password."
        : "Enter your password (up to 128 characters).",
    );
  return value;
}
export function identifier(value: unknown, label = "ID"): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new AppFailure("validation", `${label} is invalid.`);
  return value;
}
export function numeric(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new AppFailure(
      "validation",
      `${label} must be between ${min} and ${max}.`,
    );
  return value;
}
export function privacyZone(zone: PrivacyZone): PrivacyZone {
  return {
    id: identifier(zone.id, "Privacy zone"),
    label: textInput(zone.label, "Zone name", 100),
    lat: numeric(zone.lat, "Latitude", -90, 90),
    lng: numeric(zone.lng, "Longitude", -180, 180),
    radius: numeric(zone.radius, "Privacy radius", 200, 10000),
  };
}
export function profileInput(profile: Profile): Profile {
  if (!["private", "friends", "public"].includes(profile.visibility))
    throw new AppFailure("validation", "Choose a valid activity visibility.");
  if (!["system", "light", "dark"].includes(profile.theme))
    throw new AppFailure("validation", "Choose a valid appearance.");
  if (!Array.isArray(profile.privacyZones) || profile.privacyZones.length > 50)
    throw new AppFailure("validation", "You can save up to 50 privacy zones.");
  const handle = textInput(profile.handle, "Handle", 30);
  if (!/^[a-zA-Z0-9._]+$/.test(handle))
    throw new AppFailure(
      "validation",
      "Use letters, numbers, dots or underscores in your handle.",
    );
  return {
    ...profile,
    name: textInput(profile.name, "Name", 100),
    handle,
    bio: textInput(profile.bio, "Bio", 1000, false),
    maxHR: numeric(profile.maxHR, "Maximum heart rate", 100, 240),
    restingHR: numeric(profile.restingHR, "Resting heart rate", 30, 150),
    weeklyGoal: numeric(
      profile.weeklyGoal,
      "Weekly distance goal",
      1000,
      2000000,
    ),
    privacyZones: profile.privacyZones.map(privacyZone),
  };
}
```

### `src/security/errors.ts`

```ts
export type FailureKind =
  | "validation"
  | "offline"
  | "timeout"
  | "cancelled"
  | "auth"
  | "forbidden"
  | "rate_limit"
  | "storage"
  | "server"
  | "unknown";
export class AppFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "AppFailure";
  }
}
export function failure(error: unknown): AppFailure {
  if (error instanceof AppFailure) return error;
  const e =
    typeof error === "object" && error !== null
      ? (error as {
          name?: string;
          code?: string;
          status?: number;
          message?: string;
        })
      : {};
  if (e.name === "AbortError")
    return new AppFailure("cancelled", "The request was cancelled.");
  if (
    e.status === 401 ||
    ["refresh_token_not_found", "refresh_token_already_used"].includes(
      e.code ?? "",
    )
  )
    return new AppFailure(
      "auth",
      "Your session has ended. Sign in again. Your saved workouts are still on this device.",
    );
  if (e.status === 403 || e.code === "42501")
    return new AppFailure("forbidden", "You don’t have permission to do that.");
  if (e.status === 429)
    return new AppFailure(
      "rate_limit",
      "Too many requests. Wait a moment and try again.",
      true,
    );
  if (e.status && e.status >= 500)
    return new AppFailure(
      "server",
      "RIVL couldn’t reach the service. Your saved workouts are safe. Try again shortly.",
      true,
    );
  if (/network|failed to fetch|fetch failed/i.test(e.message ?? ""))
    return new AppFailure(
      "offline",
      "Connection unavailable. Your saved workouts are still here. Reconnect and retry.",
      true,
    );
  if (/SQLITE_FULL|disk is full|no space left/i.test(e.message ?? ""))
    return new AppFailure(
      "storage",
      "Your device is out of storage. Free some space, then retry. Existing workouts have not been deleted.",
    );
  if (/SQLITE|database|keychain|keystore/i.test(e.message ?? ""))
    return new AppFailure(
      "storage",
      "RIVL couldn’t open its protected data. Unlock your device and retry.",
      true,
    );
  if (e.code === "invalid_credentials")
    return new AppFailure(
      "auth",
      "Email or password didn’t match. Check them and try again.",
    );
  return new AppFailure(
    "unknown",
    "Something went wrong. Try again; your saved workouts have not been deleted.",
    true,
  );
}
export function userMessage(error: unknown): string {
  return failure(error).message;
}
```

### `src/security/diagnostics.ts`

```ts
import { failure } from "./errors";
const services = new Set([
  "background-location",
  "recording-write",
  "recording-recovery",
  "sync",
  "health",
]);
export function diagnostic(
  error: unknown,
  context?: Record<string, string | number>,
) {
  const classified = failure(error);
  return {
    error: new Error(`RIVL ${classified.kind} failure`),
    tags: {
      kind: classified.kind,
      service:
        typeof context?.service === "string" && services.has(context.service)
          ? context.service
          : "application",
    },
  };
}
```

### `src/services/crash-reporting.ts`

```ts
import * as Sentry from "@sentry/react-native";
import { config } from "./config";
import { configureTelemetry } from "./telemetry";
export function initializeCrashReporting() {
  if (!config.sentryDsn) return;
  try {
    Sentry.init({
      dsn: config.sentryDsn,
      sendDefaultPii: false,
      enableAutoSessionTracking: true,
      tracesSampleRate: 0,
      maxBreadcrumbs: 0,
      beforeSend(event) {
        delete event.user;
        delete event.request;
        delete event.extra;
        delete event.contexts;
        delete event.message;
        event.breadcrumbs = [];
        event.tags = { failure: "runtime" };
        for (const exception of event.exception?.values ?? []) {
          exception.value = "RIVL runtime failure";
          exception.type = [
            "Error",
            "TypeError",
            "RangeError",
            "ReferenceError",
            "SyntaxError",
          ].includes(exception.type ?? "")
            ? exception.type
            : "Error";
          delete exception.mechanism;
          if (exception.stacktrace?.frames) {
            exception.stacktrace.frames = exception.stacktrace.frames.map(
              (frame) => ({
                function: frame.function,
                module: frame.module,
                lineno: frame.lineno,
                colno: frame.colno,
                in_app: frame.in_app,
              }),
            );
          }
        }
        return event;
      },
    });
  } catch {
    console.warn("[RIVL] Crash reporting could not initialize.");
    return;
  }
  configureTelemetry({
    capture(error, context) {
      Sentry.captureException(error, { tags: context });
    },
    timing(name, ms) {
      Sentry.addBreadcrumb({
        category: "performance",
        message: name,
        data: { durationMs: ms },
        level: "info",
      });
    },
  });
}
```

### `src/ui/RootError.tsx`

```tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useColorScheme,
} from "react-native";
import type { ErrorBoundaryProps } from "expo-router";
import { capture } from "../services/telemetry";

export function RootError({ error, retry }: ErrorBoundaryProps) {
  const dark = useColorScheme() === "dark";
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    capture(error);
  }, [error]);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: dark ? "#101114" : "#F5F4EF",
        justifyContent: "center",
        padding: 32,
        gap: 20,
      }}
    >
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={{
          color: dark ? "#F5F4EF" : "#101114",
          fontSize: 26,
          fontWeight: "700",
        }}
      >
        RIVL couldn’t open this screen.
      </Text>
      <Text
        allowFontScaling
        style={{ color: dark ? "#F5F4EF" : "#101114", fontSize: 17 }}
      >
        Try opening it again. Workouts already saved on this device have not
        been deleted.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        style={{
          minHeight: 50,
          borderRadius: 14,
          backgroundColor: "#FF4B35",
          padding: 16,
          alignItems: "center",
        }}
        onPress={async () => {
          setBusy(true);
          try {
            await retry();
          } catch (next) {
            capture(next);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <ActivityIndicator color="#101114" />
        ) : (
          <Text
            allowFontScaling
            style={{ color: "#101114", fontSize: 17, fontWeight: "700" }}
          >
            Try again
          </Text>
        )}
      </Pressable>
    </View>
  );
}
```

### `plugins/with-native-security.js`

```js
const {
  withInfoPlist,
  withAndroidManifest,
  withDangerousMod,
  withPodfile,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");
function pinConfiguration(host, values) {
  if (!host && !values) return null;
  if (
    !host ||
    !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
      host,
    )
  )
    throw new Error(
      "RIVL_PINNED_HOST must be a DNS hostname without a scheme or path.",
    );
  const pins = [
    ...new Set(
      (values ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
  if (
    pins.length < 2 ||
    pins.some(
      (p) =>
        !/^[A-Za-z0-9+/]{43}=$/.test(p) ||
        Buffer.from(p, "base64").length !== 32 ||
        Buffer.from(p, "base64").toString("base64") !== p,
    )
  )
    throw new Error(
      "Provide at least two distinct SHA-256 SPKI pins: the current key and an independently controlled backup key.",
    );
  return { host: host.toLowerCase(), pins };
}
function androidNetworkXml(pinning, debug = false) {
  const domains = pinning
    ? `<domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">${pinning.host}</domain><pin-set>${pinning.pins.map((p) => `<pin digest="SHA-256">${p}</pin>`).join("")}</pin-set></domain-config>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="${debug}"><trust-anchors><certificates src="system"/></trust-anchors></base-config>${domains}</network-security-config>`;
}
function withNativeSecurity(config) {
  config = withPodfile(config, c => {
    const marker = "# RIVL minimum iOS version for dependency resource bundles";
    if (!c.modResults.contents.includes(marker)) {
      c.modResults.contents = c.modResults.contents.replace("post_install do |installer|", `post_install do |installer|
    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build|
        value = build.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if value.nil? || Gem::Version.new(value) < Gem::Version.new('16.0')
          build.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
        end
      end
    end`);
    }
    return c;
  });
  const pinning = pinConfiguration(
    process.env.RIVL_PINNED_HOST,
    process.env.RIVL_TLS_SPKI_PINS,
  );
  config = withInfoPlist(config, (c) => {
    c.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: process.env.EAS_BUILD_PROFILE !== "production",
      ...(pinning
        ? {
            NSPinnedDomains: {
              [pinning.host]: {
                NSIncludesSubdomains: false,
                NSPinnedLeafIdentities: pinning.pins.map((pin) => ({
                  "SPKI-SHA256-BASE64": pin,
                })),
              },
            },
          }
        : {}),
    };
    c.modResults.UIFileSharingEnabled = false;
    c.modResults.LSSupportsOpeningDocumentsInPlace = false;
    return c;
  });
  config = withAndroidManifest(config, (c) => {
    const application = c.modResults.manifest.application[0].$;
    application["android:usesCleartextTraffic"] = "false";
    application["android:allowBackup"] = "false";
    application["android:networkSecurityConfig"] = "@xml/rivl_network_security";
    application["android:fullBackupContent"] = "@xml/rivl_backup_rules";
    application["android:dataExtractionRules"] = "@xml/rivl_extraction_rules";
    return c;
  });
  return withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      await fs.mkdir(dir, { recursive: true });
      const exclusions = [
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
        "device_root",
        "device_file",
        "device_database",
        "device_sharedpref",
      ]
        .map((domain) => `<exclude domain="${domain}" path="."/>`)
        .join("");
      await fs.writeFile(
        path.join(dir, "rivl_network_security.xml"),
        androidNetworkXml(pinning),
      );
      const debugDir = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/debug/res/xml",
      );
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(
        path.join(debugDir, "rivl_network_security.xml"),
        androidNetworkXml(pinning, true),
      );
      await fs.writeFile(
        path.join(dir, "rivl_backup_rules.xml"),
        `<?xml version="1.0" encoding="utf-8"?><full-backup-content>${exclusions}</full-backup-content>`,
      );
      await fs.writeFile(
        path.join(dir, "rivl_extraction_rules.xml"),
        `<?xml version="1.0" encoding="utf-8"?><data-extraction-rules><cloud-backup>${exclusions}</cloud-backup><device-transfer>${exclusions}</device-transfer></data-extraction-rules>`,
      );
      return c;
    },
  ]);
}
module.exports = withNativeSecurity;
module.exports.pinConfiguration = pinConfiguration;
module.exports.androidNetworkXml = androidNetworkXml;
```

### `scripts/security-preflight.mjs`

```js
import { loadProjectEnv } from "@expo/env";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { pinConfiguration } from "../plugins/with-native-security.js";
const failures = [];
const production =
  process.argv.includes("--production") ||
  process.env.EAS_BUILD_PROFILE === "production";
loadProjectEnv(fileURLToPath(new URL("..", import.meta.url)), {
  mode: production ? "production" : "development",
  silent: true,
});
const config = JSON.parse(
  readFileSync(new URL("../app.json", import.meta.url), "utf8"),
).expo;
const ignores = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
if (!ignores.includes(".env.*") || !ignores.includes("!.env.example"))
  failures.push(
    "Ignore all real environment files and retain only .env.example.",
  );
if (
  !config.plugins.some(
    (p) =>
      Array.isArray(p) && p[0] === "expo-sqlite" && p[1].useSQLCipher === true,
  )
)
  failures.push("SQLCipher must be enabled in the native build.");
if (!config.plugins.includes("./plugins/with-native-security"))
  failures.push("The native TLS/backup plugin must be registered.");
for (const [key, value] of Object.entries(process.env)) {
  if (
    key.startsWith("EXPO_PUBLIC_") &&
    (/(SERVICE_ROLE|SECRET|PRIVATE_KEY|PASSWORD)/i.test(key) ||
      value?.startsWith("sb_secret_"))
  )
    failures.push(`${key} must not be bundled in the client.`);
}
if (production) {
  if (process.env.EXPO_PUBLIC_ENABLE_DEMO !== "false")
    failures.push(
      "Production must disable development accounts and simulations.",
    );
  for (const key of ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_MAP_STYLE_URL"]) {
    try {
      const u = new URL(process.env[key]);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error();
    } catch {
      failures.push(`${key} must be a valid HTTPS service URL.`);
    }
  }
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!key) failures.push("The Supabase publishable key is missing.");
  else if (!key.startsWith("sb_publishable_")) {
    try {
      const payload = JSON.parse(
        Buffer.from(key.split(".")[1], "base64url").toString(),
      );
      if (payload.role !== "anon") throw new Error();
    } catch {
      failures.push("Only a publishable or legacy anon key may be bundled.");
    }
  }
  try {
    const pins = pinConfiguration(
      process.env.RIVL_PINNED_HOST,
      process.env.RIVL_TLS_SPKI_PINS,
    );
    if (!pins)
      failures.push(
        "Production needs real current/backup API pins and an operated rotation plan.",
      );
    else if (
      pins.host !== new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname
    )
      failures.push("The pinned hostname must match the API hostname.");
  } catch (error) {
    failures.push(error.message);
  }
}
if (failures.length) {
  for (const message of failures) console.error(message);
  process.exitCode = 1;
} else
  console.log(
    `Security configuration checks passed (${production ? "production" : "development"}). Device/network validation is still required.`,
  );
```

### `supabase/migrations/202610080002_input_bounds.sql`

```sql
begin;
create function public.valid_athlete_text(value text, maximum integer, required boolean default true)
returns boolean language sql immutable strict set search_path=pg_catalog as $$
 select char_length(value)<=maximum
   and (not required or char_length(btrim(value))>0)
   and value !~ U&'[\0001-\0008\000B\000C\000E-\001F\007F\202A-\202E\2066-\2069]'
$$;
alter table public.profiles
 add constraint profile_name_safe check(public.valid_athlete_text(name,100)),
 add constraint profile_handle_safe check(handle ~ '^[a-zA-Z0-9._]{1,30}$'),
 add constraint profile_bio_safe check(public.valid_athlete_text(bio,1000,false));
alter table public.activities
 add constraint activity_title_safe check(public.valid_athlete_text(title,200)),
 add constraint activity_note_safe check(public.valid_athlete_text(note,10000,false));
alter table public.comments add constraint comment_body_safe check(public.valid_athlete_text(body,2000));
alter table public.routes
 add constraint route_name_safe check(public.valid_athlete_text(name,200)),
 add constraint route_surface_safe check(public.valid_athlete_text(surface,200,false)),
 add constraint route_distance_bound check(distance between 0 and 10000000),
 add constraint route_ascent_bound check(ascent between 0 and 100000),
 add constraint route_points_bound check(jsonb_typeof(points)='array' and jsonb_array_length(points)<=300000);
alter table public.privacy_zones add constraint privacy_label_safe check(public.valid_athlete_text(label,100));
commit;
```

## 4. App Store Validation Checklist

Published review rules and RIVL engineering acceptance tests are different. Apple and Google do not publish an exact internal test script, and neither promises acceptance because a local checklist passes. The procedure column below is the evidence we should collect before submission.

| Gate | Exact procedure and pass criterion | Current evidence |
| --- | --- | --- |
| Code correctness | Run `npm run typecheck` and `npm test`. Include invalid input, failed writes, process reconstruction, account isolation, timeout cancellation and stale sync acknowledgements | Automated checks; native behavior is outside these tests |
| Native build | Install/open Xcode, install simulator runtime; run `npm run ios:simulator`. Build Android on its SDK. Then build signed Release binaries on physical devices | Debug/Release simulator builds succeeded; first native E2E failed because unsigned test binary lacked Keychain entitlements. Ad-hoc signed simulator rerun pending |
| Signup → recording → detail | Run `npm run e2e:ios` on the development build. Separately create a staging cloud account, confirm email, record real GPS, pause/resume, save, reopen, sync and inspect detail on a second installation | Maestro files exist; not executed this pass; simulated tests do not prove GPS |
| Protected storage | On a disposable install, save a workout; inspect DB and WAL with ordinary SQLite/strings without exposing the key; plaintext queries must fail and known route/title markers must be absent. Unlock through the app and compare every saved sample. Repeat upgrade with injected export failure, key loss and low storage | SQLCipher policy/failure unit tests use mocked native I/O; actual encryption/migration pending |
| Locked recording | Record outside for at least an hour, lock screen, enable airplane mode, return and save. Repeat with low power mode and permission revocation. Confirm committed timestamps, discontinuities and distance; no fabricated gap bridging | Requires physical iOS/Android devices |
| Cold boot protection | Reboot a test device. Before first unlock, confirm protected data is not available. After unlocking, reopen and verify prior workout. Change biometric enrollment if optional biometric storage is introduced | Device test pending |
| TLS enforcement | Use a controlled staging endpoint: trusted current pin A succeeds, trusted backup B succeeds, otherwise valid unpinned C fails. Try HTTP and a cross-host redirect. Test REST/Auth/Storage/WebSocket separately and inspect release native policies | Generated policy tests only; no real pins configured |
| Token expiry | Use staging short-lived sessions; launch parallel reads near expiry, background/foreground, revoke the session, then retry sync. Verify no refresh storm, no token logging, preserved outbox and a signin path | SDK integration implemented; live Auth test pending |
| RLS and validation | Apply all three migrations to disposable Supabase/PostGIS; run `security.sql`, `sync_privacy.sql`, `input_bounds.sql` with stop-on-error. Repeat reads/writes as two distinct authenticated users and anonymous | SQL scripts not executed against a real backend |
| Accessibility/layout | Test smallest/largest supported displays, maximum text size, VoiceOver/TalkBack, dark mode, Increase Contrast, Reduce Transparency, keyboard and native tab safe areas. All core actions reachable and named; no overlap/truncation of critical data | Native inspection pending |
| Leaks/energy | Capture matched release-build Time Profiler/Allocations and Android traces; repeat 20 navigation cycles and a multi-hour record. Persistent allocations must settle; retain traces and report measured frame/energy results | No device measurements; large-history paging remains work |
| Account deletion | Complete deletion from Settings and Play's web entrypoint; interrupt storage deletion and retry; confirm Auth, workouts, media and social data removal according to documented retention | Client, durable queue and Edge Functions implemented; deployment, retry scheduler and full backend/device test pending. Play web entrypoint absent |
| UGC safety | Submit a report, block another test athlete, query their content through a modified client and verify server denial; demonstrate moderator response and reachable support | Report/block UI, server policies and staff-only removal RPC implemented. New adversarial suite not yet passing; filtering and moderator operations absent |
| Privacy disclosures | Compare captured SDK traffic against the policy, Apple privacy labels and Play Data Safety. Test denial of health/location access and prominent background-location disclosure | Submission materials and disclosure flow incomplete |
| Encryption declaration | Answer App Store Connect encryption questions for SQLCipher plus all other libraries; attach required documentation and then set appropriate metadata | Automatic exemption flag removed; assessment pending |
| Release configuration | Run `npm run security:release` with actual build environment. Demo must be false, services HTTPS, key publishable/anon, API host/pin pair correct. Archive generated plist/manifest alongside build | Gate currently fails as intended: production services/pins absent |
| Secrets/dependencies | Run repository and working-tree scans with redacted output; inspect public bundle for server secrets; resolve dependency advisories without incompatible forced upgrades | Environment checks added; no Git history exists here; full scan/review pending |

For the backend tests, set `RIVL_TEST_DATABASE_URL` in the shell's secret environment to a **disposable** test database, then run:

```sh
psql "$RIVL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202610070001_rivl.sql
psql "$RIVL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202610080001_sync_privacy.sql
psql "$RIVL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202610080002_input_bounds.sql
psql "$RIVL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
psql "$RIVL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/sync_privacy.sql
psql "$RIVL_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/input_bounds.sql
```

Use the Supabase migration runner for an existing deployed database so already-applied migrations are not replayed. These scripts require Supabase's Auth/Storage schemas, roles and PostGIS; ordinary empty PostgreSQL is insufficient. Keep connection credentials out of command logs and use a private CI secret/environment or libpq service configuration.

The production preflight is only one gate. It cannot establish that account deletion, moderation, privacy disclosures, sensor behavior or native security actually work. Those remain release blockers until their implementation and evidence are complete.
