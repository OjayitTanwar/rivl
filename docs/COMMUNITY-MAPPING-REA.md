# Community GPS reference investigation

16 October 2026. This pass compares three relevant open source shipped Android apps: OpenTracks for recording semantics, Organic Maps for offline map identity, and OsmAnd for sport-specific routing and track segments. These are useful examples, not a claim that one app is objectively best. No reference app was installed on the user's phone. No implementation or artwork was copied into RIVL.

## Acquired artifacts

- **OpenTracks 4.26.2**, official Codeberg release, 8,950,304 bytes. [Release package](https://codeberg.org/OpenTracksApp/OpenTracks/releases/download/v4.26.2/de.dennisguse.opentracks.playstore_v4.26.2_6627-reproducible-release.apk). SHA-256 `f10811267d37ffcb96064e17fb80376b5809d60eba6889cc2d5c4fb60767fd0c`. This is a pinned baseline, not a claim of latest version. The archived GitHub release page points to the active Codeberg project.
- **Organic Maps 2026.09.29-32-FDroid**, 63,797,784 bytes. [Distribution listing](https://f-droid.org/packages/app.organicmaps/), [package](https://f-droid.org/repo/app.organicmaps_26092932.apk). SHA-256 `654a736d43317084f13560281fe7013f869800610e9d6036b6789d9c9e07f8bc`. This is F-Droid's build; its digest intentionally differs from the publisher's web APK.
- **OsmAnd 5.4.7**, 388,749,205 bytes. [Official release listing](https://osmand.net/docs/versions/free-versions/), [package](https://download.osmand.net/releases/net.osmand-5.4.7-5407.apk). SHA-256 `02b540ced3cdb7629ca1c8e35040740122dedb20d2630807a54c23f5a6c44777`.

Downloads were static inputs only. Package digest establishes acquired byte identity, not signature validation. GitHub TLS acquisition failed; Codeberg, official OsmAnd downloads and F-Droid succeeded. Temporary APKs are removed after this investigation.

## Findings and implementation implications

### OpenTracks: recording points are more than a line

Observed by REA/JADX 0.7.1, Java 27, one worker:

- `TrackPointCreator.onChange` passes the configured horizontal-accuracy threshold into the recording callback, then resets transient sensor state only when that callback accepts the point. Evidence `ev_92dee892930764fe410b07314974b2419fad8bca1472d0425621abad23f1788d`.
- `createSegmentEnd` constructs an explicit manual segment-end point and resets state. Evidence `ev_86cdecc94bd24f799dbc106d381c822f1cf296318da461dc1f09ced729cf85fc`.
- `createCurrentTrackPoint` can combine a current sensor set with coordinates, speed or altitude from separate supplied points. Evidence `ev_d58d101ba6def60c7260f36a54989d7b06cd3c97c926f6dc501ff73fc7a81a79`.

RIVL design inference: preserve gap/pause boundaries through ingestion, reconstruction, display and offline export. Keep timestamps, coordinate provenance and accuracy with each genuine observation. A useful workout display point assembled from sensor sources must not silently become a fresh independent GPS observation for community corroboration. This pass does not establish OpenTracks' complete filtering algorithm or thresholds.

### Organic Maps: retain map classification separately from GPS support

REA archive inspection `ev_7f97dc22b22e4b9627639df4c0fa155153775970460aa280a9c701bf4d5bcc95` identifies the exact shipped package and embedded classification resource. A separate bounded text parse of `assets/classificator.txt` observes distinct bicycle/foot exclusion, access and barrier categories. Resource labels alone do not prove routing enforcement or a path's actual condition.

RIVL design inference: GPS frequency cannot replace source tags for access, physical barriers, permitted sport or direction. Preserve source identity and revision alongside community support; distinguish mapped cycleways from observed journey lines. Never infer protection from popularity or infer an intersection from two lines crossing visually.

Focused class inspection succeeded for `app.organicmaps.sdk.location.TrackRecorder`: evidence `ev_ff87edaf2ff0c98c63f2dd786030b366ad23fca9646e5152684062ad5133d5fa`. The Java boundary exposes native recording start/stop, empty/enabled state, save and elevation methods. This establishes a native implementation boundary; it does not establish the native filtering algorithm. A bounded native-code follow-up would be needed for that claim.

Decompiled `saveAndStop` checks for an empty recording, saves only a nonempty recording, then stops regardless. Evidence `ev_ee7da56b2c6c0231fe2f6979d8c02b9d79c5b854f3d842b6c772211ff776ad75`. RIVL implication: stopping an empty or rejected GPS capture should end cleanly without creating an apparent shared path. The native save call's persistence/recovery behavior is unknown.

### OsmAnd: a route has mode and segment semantics

REA archive inspection completed as evidence `ev_1f981fdb0ab8b7adf543c4c525e17eeb31cb8c63ba03c14b05f7029fd7e8797b`; complete MCP delivery exceeded its transport budget. The complete inventory is not retained locally and must not be described as fully reviewed. A separate format-aware XML parse of packaged `net/osmand/router/routing.xml` (148,926 bytes, SHA-256 `9758ec24fb99aed66ab25ed8403703685e50a6c11ae9c03554b466a6d62f744b`) observes separate bicycle and pedestrian profiles, different direction/restriction settings, and access/surface rule conditions. XML presence is not runtime verification.

The [official route planner documentation](https://www.osmand.net/docs/user/plan-route/create-route/?current-os=ios) describes disconnected segments and different navigation profiles per segment. The [track navigation documentation](https://www.osmand.net/docs/user/navigation/setup/gpx-navigation/?current-os=ios) distinguishes selecting a track/segment from connector routing. These documented features are separate evidence from static package analysis.

Decompiled `GPXRouteParams.prepareGPXFile`, explicit overload 1, independently preserves selected route, selected segment, reverse strategy, straight-connection option and approximation parameters before dispatching to GPX preparation. Evidence `ev_8fee8e5ef1f3ef323d4d6440c6b2d0f70c16383cae77a8cc554e4593825eabb7`; builder member inventory `ev_6c41ea0347c24e8a4fcbade0891c83cf082f3dfdc30c20c02d0ab00cdc27805a`. These distinct values are actual shipped static code evidence for keeping raw track selection and reconstructed routing separate. This method alone does not establish how approximation works or the correctness of the downstream route.

RIVL design inference: reconstruct connected evidence fragments first, keep unknown gaps explicit, and route only over a validated mode-specific network. Hiking, running and cycling suitability must not be inferred solely from distance or shared coordinates. A connector must remain distinguishable from contributed geometry.

## Acceptance checks derived for RIVL

1. A pause, poor-fix interval, privacy removal or impossible jump cannot become a new connecting edge.
2. Several workouts by one contributor count as one independent owner; duplicate imports or interpolated samples cannot inflate support.
3. Nearby parallel paths and bridge/tunnel crossings stay separate unless source topology proves connectivity.
4. Access, bicycle/foot rules, direction, surface and source freshness remain independent of journey support.
5. Ambiguous evidence produces an unverified fragment, not a confident route; the original observed fragments remain traceable through reconstruction.
6. Retraction or stale source revision removes routing eligibility and invalidates affected offline geometry.

These are implementation requirements for RIVL, not claims that every reference app implements all six checks. [OSM's recording guidance](https://wiki.openstreetmap.org/wiki/Recording_GPS_tracks) also recommends retaining genuine recordings rather than snapping collection itself to an existing map.

## Evidence limits

Archive inventory does not execute an app or validate signatures. Decompiled methods are static observations and can omit reflection/native execution. The connected MCP lacked a configured JADX path, so the existing supplied JAR and existing REA 6.4.0 CLI were used with task-local environment variables; no engine was installed or global configuration changed. APK resource decoding via apktool was unavailable. Broad class inventories in Organic Maps and OsmAnd returned a provider consistency error; narrower class lookups were used where supported. No runtime, field GPS test, licensed-source migration or full offline routing implementation is established by this report.
