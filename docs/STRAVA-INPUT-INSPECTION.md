# Strava input and dropdown inspection — 2026-10-14

## Scope and result

The user requested more polished RIVL inputs, informed by Strava through REA. The selected target remains the previously downloaded Strava Android 484.10 base APK; no app was executed and no new software was installed. Android static evidence cannot establish iOS appearance or runtime behavior.

This focused inspection is **partial**. The initial sandboxed calls were blocked, then the approved existing local CLI produced fresh class/member evidence. Class evidence establishes input configuration and shared architecture, not exact input styling or live rendering.

## Retained observations

- Base APK SHA-256: `aeb2bcb897d3ed0407d3d36bade118e8ee931d52ff5d1b088e22a51b713d5b23`.
- Class inventory evidence `ev_15ef981bd5fc0afffb509d7df966253fb8520aa806e422fc89c8e200daed1f25`, retained in `artifacts/references/strava/rea-edit-classes.json`, includes `com.strava.designsystem.StravaEditText`, `com.strava.spandex.compose.textinput.SpandexTextInputView`, and `com.strava.spandex.compose.textinput.SpandexTextInputTrailingIcon`. These names were recovered from the inventory's complete raw class pages. They support the existence of shared input primitives and a separately named trailing-icon primitive. They do not prove that a trailing icon is a clear button, nor establish its behavior.
- The existing QuickEditActivity class inventory (`rea-quick-edit-class.json`) and complete onCreate method (`rea-quick-edit-oncreate.json`) observe an activity-ID lookup, cached edit-data retrieval, and exit on missing edit data before composition wiring. This supports activity-scoped editing with explicit missing-data handling. It does not establish field validation or keyboard behavior.
- No input screenshot or live Strava form was inspected in this pass. Existing recording screenshots are insufficient evidence for form styling.

## Fresh REA attempts and limitations

1. Connected `inspect_android_class`, selecting the exact `SpandexTextInputView` and existing APK path, returned `capability_unavailable`: its server lacked `REA_JADX_MCP_JAR`.
2. The already installed REA 6.4.0 CLI was invoked with the existing caller-supplied JADX 0.7.1 JAR and JDK17. It failed compiling the macOS process-ownership helper because the Swift compiler tried to write `/Users/ojayitsinghtanwar/.cache/clang/ModuleCache` outside the writable sandbox.
3. A scoped retry pointed compiler cache environment variables at `/private/tmp`; the helper still attempted the restricted default cache and failed. These sandboxed failures produced no successful new Evidence IDs. The subsequent approved local CLI call succeeded without installs, target execution, or configuration mutation.

The selected APK was `/private/var/folders/9k/thqxp9sj3rq139pn90d_dbhw0000gn/T/rea-extracted-14e87afb-8af0-41b9-b743-512f4c570ae6/com.strava.apk`; the existing engine was `/private/tmp/rivl-rea-engine/jadx-headless-mcp-0.7.1-all.jar`. No settings, provider registration, or unrelated applications were changed.

## Reusable RIVL pattern

The following are RIVL design recommendations, **not observed Strava measurements or runtime claims**. They apply the user-requested clean fitness-app feel while preserving the existing Ink/Coral identity and field radius.

- **Label:** persistent sentence-case label above the input, distinct from the placeholder; retain accessible field names.
- **Container:** calm neutral fill, subtle 1px neutral stroke, existing 14px radius, approximately 14px interior padding and comfortably readable 16px input text. Search may use a flatter compact presentation while sharing colors and focus behavior.
- **Focus:** accent the existing stroke with RIVL Coral without changing border width or layout; preserve caller-provided focus/blur callbacks and native selection color.
- **Multiline:** the same field language, approximately 112px minimum height, text aligned to the top, natural multiline keyboard behavior.
- **Validation:** place concise helper/error text below the field, use the error stroke only for actual errors, and preserve the entered value. Do not invent new required-field or submission rules during a visual refactor.
- **Keyboard:** retain each caller's keyboard type, capitalization, secure entry, autocomplete, return-key action, and submit handlers; use next/done only when the flow already supports them.
- **Clear/search:** optional explicit accessible trailing clear action only when there is content and an existing controlled change callback can clear it. Keep it separate from password visibility controls and reserve sufficient text space.

Shared field primitives and label/error/keyboard/line configuration are supported by the retained and fresh artifact evidence. Exact Strava labels, fill/stroke values, focus underline, padding, multiline dimensions, validation timing, keyboard return behavior, and clear-button semantics remain **unknown**. No proprietary source or assets were copied into RIVL.

## Fresh input class evidence

Evidence `ev_cc70cdc38a20c0024ef7fb9dc27c5af10b63d317f83a1ad224db81d6688987ee`, operation `inspect_android_class`, selects `com.strava.spandex.compose.textinput.SpandexTextInputView` on the same APK SHA-256. Parsed members expose distinct top label, hint label, placeholder label, and error-label setters; error and enabled-state setters; configurable minimum/maximum lines; keyboard options/actions and keyboard callback; prefix/trailing icon setters; value getter/setter and value-change callback; and a focus-request override. This directly observes configuration API separation. It does not establish which settings a particular screen uses, their visual values, runtime callbacks, or clear-button behavior.

## Fresh dropdown class evidence

Evidence `ev_e983010c0350c55601ab62266cd42e2d24b466e998844099c296c5a554e7daaf`, operation `inspect_android_class`, selects `com.strava.spandex.compose.dropdown.SpandexDropdownView` on the same APK SHA-256. Parsed members expose separate label and value setters, a value getter, configuration setter, trailing-icon setter, whole-view click listener, and a separate trailing-icon click callback. This observes a reusable dropdown primitive with independent label/value and icon configuration. It does not establish the selection overlay, its size, the presence of a chevron/checkmark, or the number/density of rows.

RIVL recommendation: use a small persistent caption above a neutral field row, left-aligned current value and a trailing chevron, then a bounded sheet of flat choices with an explicit selected state and dismissal. The compact geometry, sheet presentation, and checkmark are RIVL design choices. Preserve disabled state, accessibility names, selection callbacks and scroll access to every option.

Complete fresh class evidence JSON remains at `/private/tmp/rivl-strava-input-class.json` and `/private/tmp/rivl-strava-dropdown-class.json`; these are diagnostic evidence outside the app build, not app assets.

Focused dropdown `Content` overload 0 evidence `ev_2ff3c28e6e8c391f55f3a02fdec2dbad29e60bd989fb58132b0b941a65c7d529` returned a complete Java representation with no fallback or markers. It observes composition delegation through an obfuscated wrapper/lambda and recomposition registration; it does not expose the field geometry or selection sheet. Complete diagnostic evidence is retained at `/private/tmp/rivl-strava-dropdown-content.json`. No broader decompilation was needed for the current RIVL refinement.
