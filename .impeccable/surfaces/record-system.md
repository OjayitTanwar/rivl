# Record-led RIVL system extension

User request: carry Record's aesthetic through the app and use REA as evidence where available. Preserve logo 01 and Google maps. Operate mode.

Record remains the visual authority: white/Ink/Coral, soft neutral secondary controls, bold tabular metrics, 14-unit rounded overlay surfaces, clear primary actions and restrained press feedback. Carry the 14-unit corner into shared cards, fields, buttons and badges; circular start/pause remains specific to recording. Forms and settings retain normal task layouts instead of artificial background maps.

Next feature: editing real saved activity title, notes, whole-number effort and privacy. Keep route/time/sensor records intact. Version conflicts must reject stale edits. Duration-RPE load updates when effort changes; measured heart-rate load does not. Route preview uses the same Google renderer. Ride list summaries use the athlete's speed unit; no fake route thumbnail for activities without geometry.

QUALITY BAR: shared component language matches Record, controls remain readable and tappable, real content/empty states, no copied competitor assets. Source/bundle/tests are not native visual review. Global 14-unit change requires representative native capture review; populated editor must be verified with explicitly isolated test data before whole-surface approval.

## Feature discoverability

You is the equipment and personal training hub. Immediately below profile identity, show labeled Gear · shoes & bikes, Automatic recording, and Devices & sensors destinations before statistics. Settings always has a visible text label. Keep the five primary tabs stable; secondary features use labeled rows with consistent Lucide icons and chevrons. Do not rely on an unlabeled settings icon or bury equipment below achievements. Native captures at normal and enlarged text sizes must establish that core destinations remain findable.

Navigation reference: https://developer.apple.com/design/human-interface-guidelines/tab-bars — labels describe functionality and primary navigation stays consistent. The specific equipment placement is RIVL's task-based decision, not an Apple-prescribed location.

## Unified app revision — 14 October 2026

Apply this system to every existing and future screen. Home, Maps, You, Groups, route planning/saved routes, Automatic start, Progress, personal/community heatmaps and offline guidance are the first batch. Shared Screen uses current safe-area edges (top/left/right) once, then 12 units of content padding; do not add cached whole-window inset values inside already-inset native tab scenes. Keep labels visible, flat task grouping, consistent Lucide content icons, meaningful empty/recovery states and progressive tools; retain the Record map/stats/start language rather than copying Strava assets.

Maps starts with an actual selected/current/last activity area and a local zoom; no world camera is initialized while location is unknown. Nearby overlays are clipped with GPS gaps preserved and a bounded point/cell budget. The map remains pan/search capable. Google receives only the rendered viewport, and attribution remains unobscured. Unverified manual routes use dashed strokes. LoadingJourney cycles lightweight cycling/footsteps/route-marker vector motions only during real waits, honors Reduce Motion, and carries a spoken loading label; do not add artificial loading delays or downloaded animation bundles.

Settings and hardware follow-up: use flat titled groups with meaningful disclosure for lower-frequency settings; athlete form stays visible, Gear and Automatic recording remain named entry points. Sensor lists use inline readings and disconnect controls, while Watch separates connection, setup, import and route tasks without stacked cards. Fallback maps disclose the active provider, retain attribution, and require explicit device/user/open-map provenance; Google/unknown place content stays on Google.

## Shared controls and full-screen loading — latest user direction

The user's 14 October addition overrides the earlier uniform 14-unit button corners: keep cards/fields at 14, use 18-unit primary buttons and 24-unit outlined secondary/selection controls. Overview/Analysis and sport choices use coral active pills that slide between measured positions, with Lucide sport icons. Shared buttons, icon buttons and list rows acknowledge presses with brief springs inside stable touch frames. Shared Screen choices move the already-visible body by four units to acknowledge changed content; native stack transitions remain platform-owned. Reduce Motion removes these spatial effects without hiding selection.

Full-screen loading is an opaque theme-ground overlay covering navigation and the whole display, with the existing vector journey enlarged and a visible Continue while it loads recovery action. Register only real focused map/layer loading, initial account/preference setup, route finding, path-network requests or location lookup. Continue hides the current requests without cancelling them, completion/unmount unregisters requests, and subsequent real work can show its own loader. Keep query suggestions and ongoing sensor scans inline so editing/session controls stay usable. No fake progress, artificial delays, demo workouts or animation packages. Provider preserves the underlying map view while covered so it can finish loading.

QUALITY BAR for this addition: all four sport choices fit at normal phone size, longer/enlarged choices scroll to the selected option; clear active/inactive contrast; at least 48-unit selector/icon touch frames; interrupted selection updates stay correct; actual full-screen wait and recovery/completion require native evidence. Do not infer Android, enlarged text, physical device or populated-data approval from dark iPhone simulator captures.
