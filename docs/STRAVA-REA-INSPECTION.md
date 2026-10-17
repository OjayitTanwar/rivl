# Strava package inspection

Target: user-downloaded `strava-484-10.xapk` from Uptodown, inspected on 2026-10-13 with REA 6.4.0. Android package evidence does not establish iOS behavior.

Observed archive SHA-256: `b780d0c82e638f147715dce69fc398161516a043581dc5561d7ecde9519d9df5`, matching the download page. This confirms the downloaded bytes match the site's declaration; it is not independent publisher-signature verification.

REA inspection evidence: `ev_824731d8cb67b9465b8f8d39a7e79afb5683d880d67a1d971f3bcdfd7a05cda9`. Archive inventory contains a base `com.strava.apk` and architecture, language and display-density splits.

REA extraction evidence: `ev_1c9f5b0e6189fbdcdc8a0558b0e8dc32ddcd8519aaaf726ed12d794d6fe9e186`. Containment verified; no integrity contradictions reported. Base APK SHA-256: `aeb2bcb897d3ed0407d3d36bade118e8ee931d52ff5d1b088e22a51b713d5b23`.

The initial deeper inspection was blocked by an unconfigured Android engine. This was resolved with a verified caller-supplied engine; current evidence is recorded below. No app execution occurred. Static results do not establish rendered UI behavior.

The Record redesign remains grounded in the official recording screenshots in `artifacts/references/strava`; these are visual references rather than REA runtime evidence. Competitor packages and assets are not included in RIVL builds.

## Static Android analysis now available

REA 6.4.0 with official JADX 0.7.1 (SHA-256 6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75, source 5844800a486d2248fa949b74c9896285f5b54de2) and the existing JDK17 inspected the extracted APK successfully. Complete inline evidence is retained in artifacts/references/strava/rea-android-package.json. It reports com.strava version484.10, minSDK32/targetSDK36. Class search found com.strava.activitysave.quickedit.view.QuickEditActivity and supporting data/store classes (rea-edit-classes.json). These are static class observations, not runtime UI evidence or iOS behavior. No APK execution or signature verification occurred; no competitor code/assets are shipped in RIVL.

Focused method evidence (rea-quick-edit-class.json and rea-quick-edit-oncreate.json) observes the discovered onCreate overload reading an activity ID and cached editing data, exiting if absent, then wiring navigation and a composition call. This supports an activity-scoped edit flow and explicit missing-data handling; it does not reveal a complete rendered page or establish layout, colors, or iPhone behavior. RIVL’s styling comes from the user-approved Record page.

## Maps / Home / You organization

Retained class inventory from evidence ev_15ef981bd5fc0afffb509d7df966253fb8520aa806e422fc89c8e200daed1f25 includes MapsTabFragment, filtered-search navigation, map preferences/personal-heatmap components, YouFeedFragment and ProfileCollapsingTabsFragment. The retained JSON is authoritative for the exact evidence ID; names alone do not establish visual behavior.

Focused Maps class evidence ev_27753deb746d328ec46c17db42a3fe879fe66a1cb773846b8faae8a3a08add28 and complete onViewCreated method evidence ev_12056584ff332b78165411e8d1246fb76c3f340607e7acaa02a31a04f808b3a3 observe places-search, editing, saved-routes and location-permission contracts. This supports separating the nearby discovery view from place selection and route editing. It does not establish current iOS pixel layout or prove server algorithms. No competitor code or assets were copied into RIVL.

Official behavior references: Strava Community Routes (sport/distance/elevation/surface preferences), mobile Route Builder (waypoints/undo/manual mode), and About Strava Maps (Mapbox + OSM + first-party popularity). RIVL uses its own recorded route geometry and backend, with Google as the current renderer; no claim to Strava's population data.

## Text fields — 17 October 2026

Reused the user-downloaded Strava 484.10 XAPK; extracted base APK SHA-256 aeb2bcb897d3ed0407d3d36bade118e8ee931d52ff5d1b088e22a51b713d5b23. Static REA/JADX observations:

- SpandexTextInputView.Content delegates to a shared Compose callback: ev_ef921f49fe5ac3e352b85bd15d1e6f3b8e5d6f020b1221b185f2e4814cbfba2a.
- defpackage.ow6.invoke, case1, wires focus changes, optional leading/trailing icons, configuration/value and value-change callback into a common renderer: ev_efbbb089d441b92b928abd41fc1317fc23619c7c24858078346ebf6897318a0f.
- defpackage.hc40.d uses an 8-unit rounded shape and passes enabled/error, line bounds, keyboard/visual-transformation state and supporting labels into the text control: ev_e02986efa32aa42eb52b82c1a6494dd1f1533018b7818d4f586d25e1e6444690. JADX reports duplicated blocks; this is static evidence, not runtime execution.

The retained save-activity.jpg visual reference shows a plain surface and thin neutral outline. RIVL's original shared Field now uses that visual treatment: 8-unit corners, 1-unit border, 50-unit minimum outer height, muted persistent label, readable native 17-unit text, neutral focus border and themed caret. All 86 Field instances across 30 components/screens inherit it. Password visibility, clear buttons, keyboard types, multiline editing, disabled states and errors remain native. Single-line default Return action is Done; explicit caller actions take precedence.

This does not establish current iOS Strava internals or exact pixel equivalence. No competitor code/assets are included in RIVL. Raw decompiler results remain temporary local investigation evidence.

Verification: TypeScript passed. Native sign-in typing, clearing and password visibility passed without submitting a login. Light/dark captures: artifacts/screenshots/strava-fields-oct17. Multiline uses the same primitive but the Creator walkthrough was blocked by an unsigned simulator SecureStore entitlement error; no whole-app interaction claim follows.
