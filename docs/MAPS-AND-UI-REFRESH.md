# Google Maps and interface refresh

The October 13 source update makes Google Maps the sole rendered basemap for activity maps, navigation, recording, planning, saved-path previews, exploration, density maps and community previews. Google maps reuse route overlays, preserve zoom while GPS changes, and pause following after manual panning. Recenter restores following. GPS segments remain disconnected. Map controls are limited to recenter and street/satellite.

Home, Maps, Record, Groups and You are the main tabs. Progress remains available from Home and You. Home emphasizes weekly totals, exploration and actual activities. Maps puts destination search, territory, density and routes together. Headers, surfaces and profiles are simplified. The 3D Flyover option is retired; older flyover deep links redirect to Maps. The flat activity replay remains.

Strava's official map documentation says its feed/activity maps are supplied by Mapbox using OpenStreetMap data: https://support.strava.com/en-us/articles/15402176-about-strava-maps. The screenshot references in `artifacts/references/strava` are from its official App Store listing and recording support article. They cover ten public examples, not every authenticated screen or subscription state. The manifests identify their origins; competitor images are design references only.

## Where RIVL can stand out

- Make discovering new local territory the core loop: show new tiles after every workout, weekly exploration quests, and cosmetic/story rewards. These mechanisms exist; route recommendations that maximize new ground are a next step.
- Give every activity a useful map story: fastest sustained stretch, biggest climbing stretch and highest point, paired with speed as well as pace. These are implemented estimates from recorded samples.
- Build confidence in paths: explain data coverage, distinguish a mapped facility from an assumption, and preserve saved directions for connection loss. Current warnings describe coverage; verified lane/access audits are future work.
- Keep goals personal before asking athletes to compete globally. Personal progress works without a large social network; verified leaderboards still require deployment and operations.

This is a product direction, not a claim of overall superiority to Strava. Device integrations, provider sign-in configuration, verified global rankings and production map credentials remain outstanding.

## Map availability

The configured Google Demo Key is a prototype with daily limits. Maps require a connection. Saved OSM-derived paths can support offline directions and limited rerouting, but Google basemaps cannot be downloaded through this implementation. No billing was enabled.
