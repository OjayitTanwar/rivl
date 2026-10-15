# Explore atlas refinement

Mode: Operate. Platform: adaptive; iPhone simulator is the current visual target.

User pins the supplied Wanderer map reference, asking for a less blocky, more artistic map in RIVL's style. Keep Google basemap, native controls, Coral/Warm/Ink identity and existing exploration rewards.

Code-led direction: recorded geography is the artwork. Fine blue traces show earlier outings; all segments of the most recent outing are coral. Two low-opacity strokes underneath create a soft ribbon following the actual path. Never fill arbitrary neighbourhoods or invent visited streets. GPS segments remain separate. Exploration tiles continue scoring rewards but are not drawn as squares in this view.

Maps becomes Your atlas. Rounded destination entry, clear Explore/Heatmap/Routes layers, rounded lower progress surface, compact color legend and empty-state guidance. Preserve map attribution and single recenter control. No competitor assets ship.

Scope: main Maps Explore layer, shared Google renderer supporting exploration paths. Heatmap and saved routes remain independently available. Most recent 100 real, non-demo, non-simulated activity routes are displayed; rewards still use full eligible history. No street-coverage percentage is claimed.

Verification: renderer tests cover segmented paths and stable overlays without camera refitting. Native screenshot verifies empty atlas and controls; populated real-history appearance cannot be verified on the empty simulator account.
