# Free walking and cycling maps

RIVL retains MapLibre with OpenStreetMap tiles and the existing foot/bicycle route services. No paid Google APIs, billing account, or Google keys were added.

In Plan a route, search for any place (or use coordinates/current location), choose the sport, then tap **Show walking paths nearby** or **Show cycling paths nearby**. The first stop is used if there is no searched location. Dashed blue lines show mapped paths; coral is the planned route. Hide paths removes the overlay. Searching another area or changing sport clears stale results and cancels pending requests.

The overlay requests a 1.2 km area from the public Overpass service only after tapping the control. It sends the selected area and path mode, not athlete identity or workout history. Requests are separated by at least 10 seconds, time out after 20 seconds including body reading, and render at most 500 ways / 20,000 coordinates. A limited-result notice appears when capped. Paths are separate line features, so unrelated ways are never connected. Results stay in memory and do not become saved workout geometry.

Walking selects mapped footways, paths, pedestrian ways and steps. Cycling selects cycleways, explicitly bicycle-accessible paths/tracks/footways, and mapped on-road cycle lanes. Tagged private/prohibited/conditional access and fee-required ways are conservatively excluded. Missing tags and local conditions remain uncertain; these overlays do not certify access, safety, a connected network, or completeness. Cycling lanes include shared infrastructure, not just separated cycle tracks.

Free public infrastructure is suitable for low-volume development; it has no availability guarantee and is not an unlimited production backend. There is no global prefetch or offline tile download. Wider deployment needs a capacity plan compatible with the project's zero-paid-services constraint.

## Evidence — 10 October 2026

- TypeScript and 101 tests across 17 files pass.
- A live walking query near central London returned 467 accepted path ways, with the result-limit notice enabled.
- Tests cover sport filtering, restrictions, independent line segments, result limits, request throttling, body timeout and cancellation.
- Native walking-overlay show/hide flow passed on iPhone 18 Pro / iOS 27; screenshot inspected. Evidence: `build/maestro-free-paths/2026-10-10_111716/`. Cycling filtering is unit tested; native cycling, Android and web visual verification remain outstanding.

## Sources

- [Google walking and cycling coverage](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RouteTravelMode): coverage can omit paths; Google cannot guarantee every city/path.
- [Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing): API billing varies by service.
- [Google terms](https://cloud.google.com/maps-platform/terms): bulk extraction is restricted; do not use Google to build a global copied path database.
- [Overpass shared-service guidance](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html).
- [OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/).
- [OpenStreetMap copyright and ODbL](https://www.openstreetmap.org/copyright).
