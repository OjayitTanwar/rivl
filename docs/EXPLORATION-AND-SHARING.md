# Exploration, sharing and Google Maps

The October 12 update adds a route-derived RIVL app icon, 9:16 workout stories and transparent PNG overlays. Stories show distance, moving time, pace, average speed (km/h or mph), and climbing. Start/finish and configured privacy zones are redacted from the exported trace.

Exploration uses approximate 150-metre tiles from recorded activities, with XP, levels, active-day streaks and weekly missions. New territory unlocks story styles and badges. Navigation, recording and safety features always stay available. Demo and simulated activities do not earn progress. These are personal rewards, not verified competition rankings.

Recorded activities show a fastest sustained 30-second stretch, the largest climb over 30 seconds, and the highest recorded GPS altitude, where enough valid samples exist. GPS altitude is an estimate. Select a highlight to see its colour on the map.

## Google Maps

A free Google Maps Demo Key is configured locally in the ignored `.env.local`. Public-place checks returned live Places results and two walking routes. It is a limited prototype key, not a production credential. No billing service was enabled by this update.

Destination suggestions use Google Places, navigation uses Google walking/cycling routes and alternatives, and every rendered map now uses Google Maps JavaScript. Saved route geometry and offline directions retain their independent OpenStreetMap sources; their Google map preview requires a connection. A saved route can be followed forward/reverse, with a map-selected detour. The Google Maps handoff opens the external app or browser. See `MAPS-AND-UI-REFRESH.md` for the October 13 interface update.

Guidance is currently foreground-only. Speech uses the phone's installed voices, prioritizes enhanced English voices, hides known novelty voices, and lets the athlete choose and preview a voice. The picker opened successfully on the iPhone simulator. Earphone output follows the phone's audio routing; physical earphone behavior still needs testing. Mapped infrastructure warnings are estimates: absence of mapped paths does not establish that a path is unsafe or absent. Daily Google quota exhaustion is surfaced as an error; the external Google Maps handoff remains available.

## Account providers

The free Supabase project is connected for optional online email accounts. Its eight schema migrations were applied and the public read endpoint returned HTTP 200. The sign-in screen offers **Sync online** and **On this device**, preserving existing device-account sign-in. Cloud email confirmation and a complete end-to-end activity upload still need physical-app validation.

Google and Apple sign-in flows and the `rivl://auth-callback` PKCE callback are implemented, but provider buttons remain disabled until each OAuth provider is configured and validated. Apple requires its own developer service configuration. The segment worker and scheduler have not been deployed, so cloud account access does not imply official automatic segment rankings.

## Replay and offline guidance

Flat activity route replay follows recorded timestamps, preserving the relative length of pauses and speed changes within a 45-second preview. The 3D Flyover option was removed at the user's request on October 13; old links redirect to Maps.

Downloaded areas now retain separate mapped walking and cycling path sets. If an online reroute fails, guidance can find a connected path in the saved area when both endpoints are near suitable path vertices. It declines disconnected or out-of-area routes. Voice guidance can warn when it cannot confirm mapped walking or cycling infrastructure ahead. These warnings describe map coverage, not actual safety or access.

## Validation

Typechecking and 138 tests passed after the replay, routing and voice changes. Tests cover exploration, GPS gaps, simulated-activity exclusion, speed, saved-route reversal, loop arrival, Google route decoding, OAuth callback validation, timed replay, mode-safe offline paths, disconnected routes and mapped-infrastructure warnings. On the iPhone simulator, the Google place suggestion, three walking-route options and the Google route map rendered with a live 1.6 km London route. This version has not been installed on the phone.
