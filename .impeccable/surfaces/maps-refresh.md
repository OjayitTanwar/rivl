# RIVL maps and primary screens

Mode: Operate. Platform: adaptive, iPhone simulator is the current validation target.
User direction: Strava-like clarity; all rendered basemaps use Google Maps; remove 3D Flyover. Keep RIVL logo, data, privacy and exploration rewards. This is a code-led implementation grounded in official public references, not a generated comp.

First viewport: Home shows a compact toolbar, weekly distance/time/count and a concise exploration entry before activity content. Maps shows a destination search, three layers, a large Google map and a compact exploration footer. The map attribution remains visible. Record emphasizes the map, measured data and start/pause/finish. You places identity and activity/progress actions before detailed attributes.

System: white light background, existing Ink/Coral identity, system type, compact headings, 8-point corners, clear dividers, fewer enclosing cards. Dark theme remains semantic. Five native tabs: Home, Maps, Record, Groups, You. Progress is a detail route reached from Home and You.

Signature interaction: explore/personal density/saved routes switch over a single Google map instance; real route linework, exploration tile overlays and reward progress make the athlete's own geography the content. Position updates retain zoom; manual panning pauses following until recenter. Replay marker updates do not refit the route.

Record refinement: the user pinned the official Strava record-map screenshot. Record uses an immersive map with hidden tabs, floating measured stats, a bottom control sheet and a circular Start/Pause control. Close and settings clear the safe area; map layers and recenter sit below them. The map ends above the sheet so Google attribution stays visible. Expanded stats and settings are secondary sheets, preserving the existing recording engine and recovery behavior.

Motion: native navigation, restrained press feedback, existing XP interpolation, map pan. Reduce Motion applies to shared controls and XP animation. No decorative entrance choreography.

References: artifacts/references/strava contains ten sourced screenshots from Strava's App Store page and official recording help. They calibrate task grouping and map prominence; they do not establish every authenticated screen's current design. Source manifests are beside them. No competitor assets ship in RIVL.

Constraints: Google Maps uses a free Demo Key and a JS map in the native WebView, with quota/network limits. All visible map surfaces use Google; saved road geometry and offline guidance remain independent OSM-derived data. Google offline basemap packs are not implemented. Offline copy must distinguish stored guidance from a map needing network access. No new Strava parity or hardware-validation claim.
