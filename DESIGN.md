---
name: RIVL Native
description: Adaptive athlete tools with solid surfaces, clear measurements, and route-derived Trace.
colors:
  coral: "#FF4B35"
  ink: "#101114"
  warm: "#F5F4EF"
  green: "#45DF8A"
  blue: "#3BA7FF"
  yellow: "#FFD348"
  light-surface: "#FFFFFF"
  light-muted: "#676A68"
  light-line: "#E3E3DA"
  light-soft: "#F5F4EF"
  light-accent: "#BC2D1D"
  light-good: "#197344"
  light-blue: "#1267A3"
  dark-surface: "#1D1F22"
  dark-muted: "#A5AAA7"
  dark-line: "#35373A"
  dark-soft: "#292C2D"
  dark-accent: "#FF705B"
  dark-nav: "#17181B"
typography:
  display:
    fontSize: "52px"
    lineHeight: 1.3
    letterSpacing: "-1.5px"
  title:
    fontSize: "34px"
    lineHeight: 1.3
    letterSpacing: "-0.8px"
  heading:
    fontSize: "23px"
    lineHeight: 1.3
    letterSpacing: "0px"
  subheading:
    fontSize: "18px"
    lineHeight: 1.3
    letterSpacing: "0px"
  body:
    fontSize: "17px"
    lineHeight: 1.3
    letterSpacing: "0px"
  caption:
    fontSize: "13px"
    lineHeight: 1.3
    letterSpacing: "0px"
  micro:
    fontSize: "11px"
    lineHeight: 1.3
    letterSpacing: "0px"
rounded:
  pill: "14px"
  segment: "24px"
  field: "14px"
  button: "18px"
  button-secondary: "24px"
  card: "14px"
  control: "24px"
spacing:
  compact: "8px"
  row: "12px"
  stack: "16px"
  card: "16px"
  screen: "16px"
  section: "20px"
  wide-screen: "36px"
components:
  button-primary:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "13px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.button-secondary}"
    padding: "13px 18px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "13px 18px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.light-accent}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "13px 18px"
  card:
    backgroundColor: "{colors.light-surface}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  field:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "14px"
  pill:
    backgroundColor: "{colors.light-soft}"
    textColor: "{colors.light-muted}"
    typography: "{typography.micro}"
    rounded: "{rounded.pill}"
    padding: "5px 10px"
  segmented:
    backgroundColor: "transparent"
    rounded: "{rounded.segment}"
  segment-selected:
    backgroundColor: "{colors.coral}"
    textColor: "{colors.ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.segment}"
    padding: "12px 18px"
  scope-choice:
    backgroundColor: "{colors.light-soft}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "6px 12px"
  native-navigation:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-accent}"
    typography: "{typography.micro}"
---

# Design System: RIVL Native

## Overview

**Creative North Star: "Native Operate"**

RIVL's native interface makes training data and actions easy to scan. System typography, solid content surfaces, and an Ink / Signal Coral / Warm Light identity carry the interface. The same components adapt to the selected light, dark, or system theme; route-derived Trace provides the recurring graphic signature.

This is a merge into the incumbent Native Operate system, with Record as the pinned visual authority. The current source extends its solid overlays, outlined secondary controls, bold measurements and purpose-specific rounded corners through the first batch of task screens. Identity, palette and Trail Ribbon concept 01 remain unchanged. The direction contract is `.impeccable/surfaces/record-system.md`; evidence includes `src/ui/theme.tsx`, `src/ui/primitives.tsx`, `SettingsSection`, `LoadingJourney`, the primary tabs and the associated task screens. This is an incumbent extension, not a new visual world.

The 14 native dark iPhone entry captures in `.impeccable/review/unified-oct14/` cover Home, You, Maps, Groups, planner, saved routes, Automatic start, Progress, heatmap, offline guidance, Gear, Settings, Devices and Watch. All 14 entry checks passed; this establishes those entry states only. The correction flow passed and `groups.png` and `planner.png` were recaptured at the same paths. `loading-real-wait-a.png` and `loading-real-wait-b.png` were replaced with cold actual-wait captures after (500ms) of native transition settling: different stepping poses sit on Ink, with no white field in the captured wait; the map subsequently loaded. No artificial delay was used. Cycling and route-marker variants remain implemented in source without separate capture verification. The correction reviewer disposition is ship at the listed-fix scope: Groups recovery, loading ground and documentation were scored resolved, and the cold loading flow passed. The settled wait pair and planner capture are valid evidence for that correction scope. This is not whole-surface or whole-app approval. Earlier light Gear/form/Automatic-start captures remain limited to `.impeccable/review/fitness-expansion/`. Populated content, the whole light revision, enlarged text, Android, hardware behavior, live Mapbox and the complete motion family are not fully verified. The new Segments history screen, its populated states and native forms are outside this review record.

The shared-control and full-screen loading phase is now recorded from `primitives.tsx`, `FullScreenLoading.tsx`, `loading-state.tsx` and `domain/loading-jobs.ts`. Native dark iPhone captures in `.impeccable/review/controls-oct14/` cover Overview, Analysis, sport choices, loaded planner, the full-screen wait, Continue dismissal and completion. The visual reviewer accepted the controls appearance. The correction reviewer returned ship only for the corrected foreground/request-lifetime scope: focus eligibility is independent of request lifetime, Continue survives blur/refocus, request end cleans up, and all four map renderers follow the same policy; five loading tests passed. The native same-request refocus assertion remained inconclusive after a 12-second timeout; it is not certified here. These findings establish the reviewed controls/loading scope only. They do not certify the whole app, newly added Segments or heart-rate functionality, Android, enlarged text, physical devices or every motion variant.

The subsequent field/choice/settings and health-log phase is merged from current source. Corrected dark/light shared-input and choice captures are retained in `.impeccable/review/resume-oct14/`; the health-screen capture batch under `/private/tmp/rivl-health-review-output3/` was still under review when this record was written. Supplied implementation checks report typecheck, 296 tests across 47 files and security checks passing; earlier SQL verification covered ten migrations and ten local tests only. Those checks do not establish visual, production SQL or hardware approval. Keyboard avoidance, enlarged text, physical health-service reads and natural voice quality remain unverified. The health patterns below describe implemented presentation and source behavior, without extending the prior controls/loading review disposition.

The earlier 14 October workspace phase merged the user-authorized information architecture into the same Record-led system. Source evidence is `app/(tabs)/(home)/`, `Navigation.tsx`, `Navigation.web.tsx` and `LabelValueRow.tsx`. That earlier revision kept Home, Maps, Record and Groups visible while Home owned the workspace pages; the latest contextual navigation direction below supersedes that persistence rule. Existing destination URLs remain valid through the nested Home stack. The capture matrix in `.impeccable/review/workspaces-oct14/` includes dark/light entry and empty-form states and iOS accessibility-medium enlarged screens; normal text was restored afterwards. A native Nutrition draft survived Groups → Home and scrolling. The enlarged goals capture exposed overlapping macro labels/values; the current source fixes this with the shared responsive LabelValueRow, also used for diary, report and grocery rows. The corrected enlarged goals capture, `nutrition-goals-large.png`, was recorded at 21:03. The workspace fix reviewer returned ship for its two scored fixes: documentation/navigation accuracy and enlarged nutrition label/value separation. This is narrow correction approval, not whole-workspace or whole-app approval. Final whole-project checks passed at 21:09: TypeScript, 388 tests across 60 suites and development security preflight. The imported movement and measured cycling-power slices are source complete. The reviewer returned ship for the power deadline/cancellation source fix only, separate from the two scored workspace corrections; neither verdict establishes broad surface or hardware approval. Eleven SQL migrations and eleven local SQL checks passed, without hosted deployment. Community GPS contribution is a source pilot, not validated dedicated track geometry. Keyboard avoidance, populated flows, hardware, Android, voice and full HIG certification remain outside this capture scope.

The latest user-authorized revision makes Health, Nutrition and Guided training complete root-sibling workspaces. Each uses one contextual bottom bar: Health Overview/Sleep/Log/Connect, Nutrition Diary/Plan/Recipes/Insights, and Training Plans/Session/Creators/History. A labeled RIVL header action returns to the main app. The main Home/Maps/Record/Groups bar is replaced while a workspace is open; identity, authentication, storage and the recording engine are shared. Source authority is `app/(health)/`, `app/(nutrition)/`, `app/(training)/`, `WorkspaceAuth.tsx` and `WorkspaceExit.tsx`. All 12 workspace pages were reached with separate contextual bars in `.impeccable/review/workspace-apps-oct14/`. Final corrected settled Sleep and Studio captures passed. Studio uses compact Library/My programs segmented choices with distinct loading, retry/error and confirmed-empty states. An unsaved blank Studio form survived Creators → History → Creators, and the RIVL exit passed. Three enlarged frames—Health Overview, Nutrition Insights Goals and Studio form—passed, then normal text was restored. No populated-flow, keyboard-avoidance, hardware, Android or full HIG claim follows from these entry/form captures. Final reviewer scoring remains pending. Final whole-project TypeScript, 407 tests across 62 suites and development security preflight passed; all 12 migrations and 12 SQL suites passed locally. Hosted deployment is not established. The user explicitly authorized physical installation, superseding the earlier restriction. The latest Release build was installed in place on the connected iPhone 15 (`00008120-000E05E00C81A01E`), bundle `app.rivl.training`, and launched successfully as process 1237; a subsequent process check confirmed it remained running. The current workspace apps and Creator Studio are in this installed build. Its JavaScript bundle is embedded and requires no Metro server. Free provisioning expires 15 October 2026 at 17:27:25 IST (11:57:25 UTC). Installation and launch do not validate physical sensors, Watch, HealthKit imports, locked-screen operation or hosted services.

**Key Characteristics:**
- Solid theme-aware content surfaces and functional accent color.
- Native scalable text with tabular measurements.
- Scrollable task screens with flat grouping, labeled destinations and shared Record-derived corners.
- Native navigation and labeled scope selection.
- Route geometry, honest availability, explicit recovery actions and real-wait loading feedback.

## Colors

Signal Coral identifies action and route data; neutral surfaces hold the content, with semantic colors adjusted for each theme.

### Primary
- **Signal Coral** (`coral`): primary button fill, trace linework, route overlays, and chart emphasis. Primary button text remains Ink in both themes.
- **Readable Coral** (`light-accent`, `dark-accent`): text actions, warnings, picker-related emphasis, and active navigation tint. Text accents use the theme value rather than the brighter brand fill.

### Secondary
- **Recovery Green** (`green`, `light-good`): recovery and positive status. The light theme uses its darker semantic value for text.
- **Performance Blue** (`blue`, `light-blue`): performance series and map reference/network geometry. Text may use the darker light-theme semantic value; map strokes retain brand Blue.

### Tertiary
- **Achievement Yellow** (`yellow`): achievement pills and supporting training data; yellow pills carry Ink text.

### Neutral
- **Ink** (`ink`): light-theme text, fixed dark cards, and dark-theme canvas.
- **Warm Light** (`warm`): soft light controls and dark-theme text; the light canvas and navigation are white.
- **Content Surface** (`light-surface`, `dark-surface`): cards.
- **Soft Surface** (`light-soft`, `dark-soft`): read-only fields, compact scope triggers and status pills.
- **Muted Text** (`light-muted`, `dark-muted`): secondary descriptions, units, and labels.
- **Divider** (`light-line`, `dark-line`): list separators, field outlines, and neutral tracks.
- **Dark Navigation** (`dark-nav`): native navigation's configured dark background; its final material is platform-rendered.

### Named Rules

**The Fill and Foreground Rule.** Use brand Coral for primary fill and theme accent for ordinary accent text; choose semantic good/blue text from the active theme.

**The Accessible Theme Rule.** High contrast replaces muted text with the foreground and dividers with the original muted value. Theme selection follows the athlete's setting or the system scheme.

## Typography

**Display Font:** native platform default, as explicitly required by the adaptive native direction.

**Body Font:** the same native platform default. Source does not assign a custom `fontFamily`; the sidecar's `system-ui` is a browser preview translation, not a font asset commitment.

**Label/Mono Font:** same platform family with tabular numerals when `mono` is requested; this flag does not select a monospace face.

**Character:** a direct sans-serif hierarchy, with bold titles and measurements above regular descriptions. Frontmatter sizes serialize React Native logical units as px for tooling; physical screenshot pixels and device scale are not the token scale.

### Hierarchy
- **Display:** largest numerical emphasis, generally bold (700); use the `display` token for prominent training values.
- **Title:** primary measurements and prominent numerical emphasis, generally bold (700), using `title`.
- **Heading:** compact screen and section titles and smaller measurements, generally bold (700), using `heading`.
- **Subheading:** compact card headings, generally bold (700), using `subheading`.
- **Body:** descriptions and button labels using `body`; regular text defaults to (400), buttons use (700), and row titles often use (600).
- **Caption:** labels, units, summaries, and secondary actions using `caption`, with regular or semibold (600) weight.
- **Micro:** compact status tags and metadata using `micro`; pills use (700). This role is not permission to add a label above a heading.

### Named Rules

**The Measured Numerals Rule.** Measurements use tabular numerals. Metric values may shrink to their implemented minimum scale (0.75) to fit, while units can wrap at the baseline and labels retain their own line.

**The Native Scaling Rule.** Shared text allows font scaling. Keep flexible metric rows and text shrink behavior when adapting content; do not freeze the system to simulator pixel dimensions.

## Layout

The common screen is a safe-area-aware scrolling column. Content fills available width up to the implemented cap (1120 logical units), centered, with screen gutters from the `screen` spacing token. Above the screen breakpoint (width greater than 760), gutters use `wide-screen`. `SafeAreaView` applies the current top/left/right edges once; native content then adds (12) top padding and web content (36). Cached whole-window insets are not added inside already-inset native tab scenes. Bottom content padding is (32) for back-navigation detail screens and (120) for primary screens, and section separation follows `section`. Screen scroll views disable automatic content insets, adjust keyboard insets and dismiss the keyboard interactively.

Rows align at center with `row` spacing; stacks default to `stack`. Cards use `card` padding and `stack` internal gaps. Smaller gaps gather labels with their values; section gaps separate tasks. Home is a flat workspace hub with labeled Activity, Health, Nutrition and Guided training rows, followed by You & settings. The Activity destination carries the practical workout column, compact weekly metrics and exploration progress. Common secondary destinations are labeled rows with drawn icons and chevrons. Maps uses a search and layer toolbar above its large map; Record uses a dedicated immersive layout rather than the common Screen wrapper.

Metrics occupy flexible cells with a minimum width (85), using flexible rows in Activity and wrapped rows in activity detail. Horizontal segmented groups scroll rather than compress every option. Ranking scopes with many choices use a compact labeled Choice sheet; short periods and sport choices use segmented controls.

Interactive shared buttons have minimum height (50), fields and compact scope triggers (56), icon buttons (48), and list rows (64). Selector options use a minimum height (48); section-action targets use native minimums (44 on iOS, 48 on Android). Collapsible settings headings expose an expanded accessibility state and a minimum target (48). These are source-defined logical dimensions; platform defaults still own action-sheet and tab-bar geometry.

**The Separate Label and Value Rule.** Repeated nutrition label/value rows use the shared LabelValueRow. At fontScale of at least (1.3), or window width below (320), label and tabular value stack with a (4)-unit gap. Otherwise the label flexes and the right-aligned value may shrink within half the row width. Diary totals, report macros, recipe macros and grocery quantities reuse this behavior; large text must not overlap its label.

## Elevation & Depth

Content primitives and Record overlays use no authored shadows. Depth comes from the canvas, solid cards, soft controls, and selected segment surfaces. Native tab navigation renders its own platform material. The optional `GlassControl` implementation uses genuine supported iOS Liquid Glass only when transparency and contrast settings permit it, otherwise a solid surface; it currently has no screen call sites and is not evidence of a glass content system.

### Named Rules

**The Solid Content Rule.** Keep content cards and fields solid. Let supported native chrome own its material instead of drawing a glass treatment onto data surfaces.

## Shapes

Content retains Record-derived corners (14 logical units): cards and map containers use `card`, fields and route previews use `field`, and compact status tags use `pill`. Shared primary, quiet and danger buttons use `button` (18); outlined secondary buttons use `button-secondary` (24); compact scope triggers use `field` (14). Segmented option outlines and their moving Coral selection pill use `segment` (24). Circular icon buttons use `control` (24) around a 48-unit square touch frame. Circular recording actions retain their dedicated geometry.

Planner search/overlay containers and Progress calendar cells still carry local (8) corners; they do not change the shared tokens. Lists use thin dividers (1) where appropriate. Cards remain flat with a theme divider stroke (1) by default; the fixed dark option removes the stroke. Secondary buttons carry a theme divider stroke; fields use quiet filled surfaces and a focus/error outline. Maps clip their content to their rounded container. Route strokes use round caps and joins so geometry remains readable at turns.

## Components

### Buttons

Clear actions with a solid primary emphasis. Variants share body text, bold weight (700), and compact horizontal/vertical padding from the component tokens. Primary, quiet and danger use 18-unit corners; secondary uses 24-unit corners and a theme divider outline (1).

- **Primary:** Coral fill with Ink text, independent of theme.
- **Secondary:** transparent fill with theme foreground and a theme divider outline.
- **Quiet:** transparent with theme foreground.
- **Danger:** transparent with theme accent.
- **States:** pressed opacity (0.85) and an inner spring scale (0.96), suppressed under Reduce Motion, explicitly disabled opacity (0.4), an inline activity indicator for loading, and duplicate-action locking while pending. Native selection haptics accompany activation. Errors surface an actionable native alert.
- **Icon and row feedback:** icon content springs to scale (0.92), selector content to (0.95), and actionable list-row content shifts horizontally (3); outer touch frames stay stable. Reduce Motion suppresses these spatial effects while retaining visible press opacity and selected states.
- **Focus:** native controls retain platform interaction. The sidecar supplies browser preview focus styles; it does not establish a shipped native hover treatment.

### Chips

Compact status labels. Pills use the soft surface, muted text, and micro bold typography by default. Semantic overrides carry positive, warning, demo, or achievement meaning. Demo labels identify sample content; they are meaningful disclosure, not invented decoration.

### Cards / Containers

Solid content groups. Cards use theme surface, `card` corners and padding, and `stack` gaps with no authored shadow and a theme divider stroke (1). The `dark` option selects fixed Ink. One-off tinted activity cards do not expand the reusable palette.

### Inputs / Fields

Labeled native text fields use quiet filled theme-soft surfaces, a 12-unit radius and 16-unit horizontal padding. Minimum height is 52; text uses body 17 with 12-unit vertical padding. Multiline minimum text height is 108 with top alignment. Caption semibold labels remain muted, turn accent on error, and tapping a label focuses its input. Idle fields have no visible outline except in high contrast; editable focus/error shows a thin 1-unit accent stroke. Disabled fields retain the fill with reduced opacity. Caret/selection use theme accent. Hidden labels retain accessible names. Password fields expose a 44-unit Show/Hide control; focused controlled single-line text fields expose a 44-unit Clear action unless a custom trailing slot owns that space. Optional error text announces as an alert; helper copy sits beneath the field. Caller props, secure entry, keyboard type and form state remain native.

15 October simulator evidence: normal dark blank/focused Creator fields, typing and clearing passed after fixing label-to-input focus. No program was saved. Light/enlarged frames were unsettled and are not validation; no physical keyboard/screen-reader or whole-app claim follows.

### Navigation

The main app has four platform-native tabs: Home, Maps, Record and Groups, including a visible bar on Record entry. Home keeps Activity and You/profile within its index-anchored stack, with labeled entries to the three root-sibling workspaces. Health replaces the main bar with Overview/Sleep/Log/Connect; Nutrition uses Diary/Plan/Recipes/Insights; Guided training uses Plans/Session/Creators/History. Workspace pages expose a quiet labeled RIVL header action returning to `/`. Shared authentication gates these groups without creating a separate identity or store. Opening a workspace, adopting a program or returning to RIVL does not change recording state. Native bars use theme accent tint, navigation surface and micro labels, SF Symbols on iOS and Material icons on Android. Web workspace layouts use their own theme-aware Expo Tabs; the main app retains its 224-unit sidebar at widths of at least 1000 and bottom bar below that width. Content icons use Lucide.

**The One Bar Rule.** Each workspace owns one contextual bottom bar. Replace the main app bar while Health, Nutrition or Training is open; keep the labeled RIVL return action visible and reuse the shared theme and identity.

### Scope Choices and Segmented Controls

Scope choices use a compact soft-filled 14-unit trigger: caption label above body-sized selected value, Lucide chevron (18), padding (6 vertical / 12 horizontal) and minimum height (56). Open state accents the outline; an empty option list disables the trigger and states “No options available”. Activation dismisses the keyboard and opens a flat bottom sheet across platforms. The sheet is centered up to (560) wide and bounded to 72% of window height, with 14-unit upper corners and Ink backdrop opacity (0.48). Its (60)-minimum header contains the title and a (48)-minimum Cancel action; divider-separated radio rows use minimum height (52), vertical padding (14), body labels and an accent check (20). The selected row scrolls into view. Selection closes the sheet; backdrop, Cancel, native back and web Escape dismiss it. Focus restoration is implemented, with no claim of independent assistive-technology verification. Reduce Motion removes the sheet fade.

Segmented groups use separate outlined options with gaps (8), caption semibold, 24-unit corners and explicit accessibility selected state. A Coral pill animates its measured left position and width, preserving round ends across unequal labels; selected content is Ink, inactive content is theme-muted. Sport options include Lucide Bike, Mountain or Footprints icons (17), a content gap (7), and horizontal padding (14); text-only options use (18). Options have vertical padding (12) and minimum height (48). The group scrolls horizontally only when the selected option falls outside the measured viewport. Compact text choices use padding (11) and gaps (6); regular text choices retain padding (18) and gaps (8). Interrupted geometry animations stop before the next target. Selection haptics acknowledge changed values. Within shared Screen, scope and segmented changes shift the visible body down (4) and spring back; native stack transitions remain platform-owned. Reduce Motion sets the final measured geometry directly, scrolls without animation and suppresses body translation.

### Metrics

Value, optional unit, then a separate caption label. Primary values use title bold; the small variant uses heading bold. Flexible width, wrapping units, tabular numerals, and limited value shrinking preserve readable time and distance values on narrow screens. Metric headings do not become decorative kickers.

### Trace and Maps

The approved identity mark is Trail Ribbon (Brandkit concept 01): three flowing filled ribbons forming an organic route symbol. Use the Coral app-icon field with Ink mark, or Warm mark on Ink. The SVG master and React Native path share the same geometry; keep its proportions and avoid shadows. Transparent mark variants serve avatars and watermarks, while the opaque 1024px app icon leaves its outer masking to the platform.

The Explore layer is an athlete's atlas: fine blue paths for earlier outings and coral paths for the latest outing, with two translucent ribbon strokes following recorded geometry. GPS segments stay separate; square reward tiles are not displayed in this view. The atlas destination entry and progress panel use local 24px rounding. These are surface-specific treatments, not changes to the shared control radius. Rewards retain their existing tile accounting. The empty state invites the first real outing rather than showing synthetic geography.

Trace derives its silhouette from route samples in native activity and route lists. Its main line is Coral by default, with a fine displaced echo; actual route geometry is the signature. Route previews use the theme soft surface and a single accent line. The generic fallback curve is not athlete route evidence.

Google Maps is the primary basemap through the shared web/WebView implementation. The optional controller can use a disclosed Mapbox web/WebView fallback only with a configured public token and eligible explicit provenance; Google/unknown place content remains on Google. No native Mapbox SDK or live token validation is established by this record. Google and Mapbox native/WebView and web/iframe source now paint their initial host and document backgrounds from the active theme. Google draw updates its root, map element and map background without reloading the document on every GPS or theme change. The cold native Google wait captures verify the Ink wait field in that flow; they do not validate live Mapbox or every theme transition. Roadmap and satellite layers retain provider attribution. Athlete routes and reference geometry remain distinct overlays; layer controls switch exploration density, personal density, and saved routes on a single map. Following updates preserve zoom, manual panning pauses following until recenter, and replay marker changes do not refit the route. Saved OSM-derived road/path guidance is separate data, not an offline Google basemap. Map network or quota unavailability is disclosed in context. Maps starts from a selected area, current location or last real activity endpoint; an unknown location presents a location/search recovery state instead of initializing a world camera. Local overlays retain GPS gaps and use bounded viewport clipping. Unverified manual paths use dashed strokes.

### Record Map and Controls

Record is an immersive, edge-to-edge map with a floating solid stats panel and a bottom control sheet. The map ends above the measured sheet height so attribution remains visible. Safe-area-aware circular Close and Settings controls sit above map layers and recenter. The stats panel exposes time, pace/speed, and distance, with expandable details; its surface uses rounded corners (14) without a shadow. The control sheet uses top corners (24), a compact handle, scrollable content, and bottom safe-area clearance. Primary Start/Pause controls are circular (92 diameter); secondary controls are circular (60 diameter), with visible caption labels and meaningful vector icons. Their press spring scales to (0.95), remaining at (1) under Reduce Motion. Settings and expanded stats are secondary sheets. These dimensions describe this component, not a new global spacing scale.

### Availability and Recovery States

Device screens show real current readings, waiting states, and missing values as dashes. Watch screens distinguish unsupported, unpaired, uninstalled, connected, and temporarily unreachable states. Connect and send actions require the supported/paired/installed prerequisites and athlete identity; setup instructions provide the next step. Import can remain available for previously received workouts even when the watch prerequisites are not currently met. Loading indicators and notices distinguish progress from errors. Groups empty states pair ordinary explanations with a usable next action: available private activities, cloud sign-in, retry or refresh according to the current prerequisite. Recovery destinations use the same secondary control language as other task screens.

### Flat Settings Groups

Settings and Watch use divider-separated titled sections rather than nested cards. Lower-frequency Settings groups disclose on demand; core athlete fields stay open, with optional power, body-weight and birth-year fields behind a labeled “More athlete details” row. Groups use divider strokes, top/bottom padding (12), body semibold headings and internal gaps (16). Disclosure headings use body semibold text, a Lucide chevron and explicit expanded state. Devices show readings and disconnect controls inline. Named Gear, Automatic recording and Devices & sensors rows sit directly after You identity, before statistics; Settings has a visible text label.

### Loading Journey

A small drawn vector movement appears only during actual waits. Successive instances select cycling, footsteps or a route marker. The shared progress cycle uses a sine in/out transition (2200ms in each direction); cycling advances smoothly with a rotating pedal, footsteps alternate tilt and bounce across stepped positions, and the route marker pauses and rises onto a stepped path. Reduce Motion freezes a stable halfway position. The wrapper exposes a spoken progress label and visible caption. The real-wait pair in `.impeccable/review/unified-oct14/loading-real-wait-a.png` and `loading-real-wait-b.png` shows a changing stepping pose on the Ink wait field after native transition settling and before the map loaded. This pair replaces the earlier wait captures at the same paths. Cycling and route-marker variants remain source evidence without separate captures; still images do not verify exact timing or the full motion family. No artificial delay or raster animation asset is introduced.

### Full-screen Loading

Real registered waits use an over-full-screen modal with an opaque active-theme canvas, covering navigation while keeping underlying content mounted so maps can complete. LoadingJourney is enlarged (1.7×), with heading semibold text and the existing accessible progress label. A persistent outlined “Continue while it loads” button and a short explanation make recovery visible. The modal fades unless Reduce Motion requests no transition. The last meaningful loading label is retained during exit.

**The Request Lifetime Rule.** Request registration follows active work until completion or unmount; focus only determines foreground eligibility. Continue dismisses currently visible requests without cancelling them. That dismissal survives blur/refocus for the same active request. Background jobs are excluded from Continue and can become visible on later focus. End removes the job, dismissal and background state; subsequent real work can show its own loader. All four Google/Mapbox native/web renderers use this policy.

Full-screen registration is limited to actual map/layer waits, account/preference initialization, route finding, path-network requests and location lookup. Query suggestions and ongoing sensor scans remain inline. No artificial delay or progress percentage is added. Captured wait, dismissal and completion establish the reviewed native flow; exact timing and native same-request refocus remain outside verified capture claims.

### Health Log and Heart-rate Settings

Health log is a labeled Home destination using the shared icon/list-row language. Its screen keeps explanatory text, connection/refresh action, latest values, fasting timer and history in flat SettingsSection groups. Missing values remain explicit; history names the provider or “User-entered” beside date/time and units. HealthKit and Health Connect imports refresh on connected screen entry and app return, with a visible manual refresh action. Imported history rows are read-only and direct edits to their originating app; Add record opens shared labeled fields and the compact Record choice for manual fallback. Saving shows pending text, failures show actionable notices, and editing remains in the scrolling screen. No new palette, font, material or fabricated health data enters the system. Imported movement now includes HealthKit flights climbed or Health Connect floors climbed and active energy, with provider-specific units and read timestamps. Floors are not inferred from steps; active energy excludes resting energy and is not a food allowance. The native empty-state movement capture `health-movement.png` passed at 21:08 without imports, permission requests or created data; physical service reads remain unverified.

Heart-rate settings explain five effort ranges before optional customization. A small automatic log shows the highest sustained recorded reading, recent dates and bpm values; saved real workout samples must agree for at least ten seconds, excluding isolated spikes and simulated workouts. The recorded peak is distinguished from a physiological maximum. Applying an eligible higher observed peak or saving personal thresholds is an explicit action for future zones; saved activities remain unchanged. Customization discloses four labeled numeric fields with trailing bpm units, saved ranges, Save and default-reset actions, using existing controls and notices.

### Home Workspaces

The hub and its destinations use the existing solid Screen, flat SettingsSection groups, Lucide list rows, labeled Field, compact Choice and shared Button variants. Activity retains workout, route and progress content. Health groups daily values, connection/refresh, fasting and history; its Sleep destination presents real imported sessions, source attribution and explicit missing/partial readings without invented sleep scores. Nutrition uses a diary with food lookup and inline editing; Nutrition insights groups report, targets, recipes, seven-day planning and grocery quantities with ordinary section headings and responsive LabelValueRow measurements. Guided training separates saved plans, an explicit Start action, the active session and recent intervals; opening the workspace starts no session.

Same-owner inline drafts survive focus changes within their mounted Health, Nutrition, Nutrition insights and Guided training screens. Source resets the editor when the owner changes. Data reloads and availability notices stay distinct from the unsaved editor; do not dismiss drafts merely because the athlete switches global tabs. The native Nutrition round-trip capture verifies that particular draft-preservation flow, without certifying every populated workflow.

### Creator Studio

Training’s Creators page uses ordinary flat SettingsSection groups for My programs, Published programs, import preview and open training resources. Program metadata and scheduled intervals use shared labeled fields and compact choices; Save draft is explicit, and a preview exposes the program, sessions, creator and license before saving a copy. Scheduled sessions start only from a labeled Start action. Sharing and destructive actions require their own confirmation; imported attribution remains visible. Library/My programs uses the shared compact Segmented control. Library loading, error/retry and confirmed-empty states remain distinct in source; the blank editor survives a native History round trip. This extends the existing Record-led language with no new palette, display face or decorative material.

### Measured Cycling Power

The existing activity analysis surface presents recorded cycling best-average power for (5, 30, 60, 300 and 1200)-second windows, reusing LabelValueRow, existing chart colors and ordinary explanatory captions. Watts/kg is offered when athlete weight exists. Missing continuous coverage remains “Unavailable”; actual zero-watt readings remain zero, and exceeding the bounded sample limit produces a disclosure instead of a partial best. Historical comparison remains visibly distinguished from the selected activity. The reviewer returned ship for the power deadline/cancellation source fix only. No populated native power capture or physical power-sensor operation is established by this document. Current acquisition holds the latest actual BLE watts for up to five seconds; raw Sample lacks the original notification timestamp, so the strict sample curve cannot retrospectively prove BLE freshness.

### Gear

Private mileage uses a flat, divider-separated list with drawn shoes/bike icons, names, distance, activity counts and explicit Default, Retired or Selected status. The empty state offers one Add gear action and discloses local-device storage. Add/edit stays within the same scrolling screen: compact heading, shared labeled fields, two type buttons, a native default switch, primary Save and quiet Cancel. Retirement preserves historical context; no new colors, typography or assets are introduced.

### Automatic Start

Settings places a short foreground-only explanation before the native switch and labeled Sport segmented control. Consent requirements, review-before-saving and battery limitations follow in ordinary text, with platform-specific notices where needed. The switch owns enable/disable; there is no duplicate disable action. Shared theme foregrounds, outlined choices and compact screen headings remain consistent. This records the implemented settings UI, not validated outdoor detection.

The earlier light capture scope covers empty Gear, add form and Automatic-start settings; the October dark batch adds their entry states only. Populated lists, enlarged text, Android and outdoor detection remain unverified.

## Do's and Don'ts

### Do:
- **Do** use theme-aware foreground and semantic accent tokens on the active solid surface.
- **Do** preserve one contextual bar per workspace, the labeled RIVL return action, main app destinations, scope selection, accessibility labels and selected states.
- **Do** keep measurement units and labels readable with flexible wrapping, tabular numerals and stacked nutrition label/value rows at enlarged text sizes.
- **Do** derive Trace from the displayed route and preserve continuous offline path geometry.
- **Do** explain unmet prerequisites next to disabled watch actions and preserve the received-workout import exception.
- **Do** disclose demo data, unavailable readings, and partial map coverage in the content itself.
- **Do** reuse the shared Record-derived corners and flat titled groups for related task screens.
- **Do** keep destinations labeled, recovery actions usable, and loading feedback tied to actual waits.
- **Do** preserve stable touch frames, measured selection positions and Reduce Motion behavior.
- **Do** keep request lifetime separate from foreground eligibility; Continue hides only visible work without cancelling it.
- **Do** preserve approved Trail Ribbon concept 01 geometry and provider attribution.

### Don't:
- **Don't** promote an unapproved concept-board mark or font into shipped identity tokens; approved Trail Ribbon concept 01 remains the identity authority.
- **Don't** use bright brand fills as ordinary text accents when the theme provides a semantic foreground value.
- **Don't** introduce 3D Flyover; the confirmed map direction uses Google basemaps and direct 2D athlete overlays.
- **Don't** add decorative glass to content surfaces or fake unsupported native materials.
- **Don't** replace drawn or native icons with text glyphs or emoji.
- **Don't** add kickers or eyebrows above headings; existing uses are recorded defects, not a reusable pattern.
- **Don't** treat the synthetic fallback Trace curve as a recorded athlete route.
- **Don't** claim entry-state simulator screenshots validate populated flows, other themes, enlarged text, Android, physical devices, live fallback maps or watch/sensor operation.

Not canonized: kicker-like standalone labels remain craft-floor defects where present; the shared Screen no longer renders its legacy eyebrow prop. The synthetic fallback Trace, one-off card/chart colors, unapproved concept-board mark/font and remaining local corner inconsistencies are not reusable visual authority. The enlarged nutrition overlap is a corrected defect, not an approved density token; narrow correction approval does not establish populated-flow or hardware approval. Unverified movement, hardware and populated behavior are not promoted into visual-review claims. Native system typography is retained because the explicit adaptive native brief requires it; it is not an own-world web display-font precedent.

The sidecar's synthesized tonal ramps and HTML/CSS translations support the design panel only. They are not additional shipped palette, material, motion, or platform-interaction rules.

### User-selectable accent — 15 October 2026

Settings → Display & accessibility includes six named accent swatches: Orange (default), Blue, Purple, Green, Teal and Pink. `src/domain/appearance.ts` is the source of their light/dark text accent and bright control fill pairs. The optional profile accentColor persists through existing profile settings storage/sync; old profiles remain orange. Theme `accent` serves readable text/icons/focus/native tabs; `primary` serves filled controls with ink text. Shared buttons, segmented choices, record actions, switches, progress and default chart treatments follow the selection. Brand logo artwork and semantic multicolour HR/zone series retain their meaning. Swatches expose names and selected state; colour alone does not identify the choice.

### Activity-led page completion — 16 October 2026

The current reference is `app/(tabs)/(home)/activity-space.tsx`, with its clear section order, compact real measurement band, 24-unit screen rhythm, flat divided lists and useful first-use actions. Applied source refinement covers Health/Sleep; all Nutrition and Guided Training pages; social directory, competition, notifications and blocking; account/recovery/report forms; Settings, sensors, Watch, gear and map utility screens. Existing Activity detail, Record, Maps/route planner, Offline maps, Progress and Segments retain their established purpose-built layouts where no concrete drift was found. Source summaries show actual records or explicit missing readings. Editing/import tasks are disclosed rather than dominating the overview; opening a workspace does not start GPS, a timer or an import.

Source validation passed TypeScript, 469 tests / 70 suites and development security. Native screenshot evidence is recorded separately; source coverage does not assert every populated, keyboard, light-theme or hardware state was verified.


### Quieter workspaces and stable tabs — 16 October 2026

Health, Nutrition and Training use inline first-read feedback rather than the global full-screen overlay. Same-owner tab returns preserve restored content and draft state during background refresh. Account changes still mask prior-owner data. Their native bars use minimizeBehavior=never so scrolling does not resize the bar. Record retains its requested full-screen loading journey. Repetitive empty rows and explanatory paragraphs were shortened or placed behind disclosures; the shared readable text sizes were retained. The 15 actual dark iPhone simulator screenshots in artifacts/screenshots/activity-polish-oct16 cover entry/empty states. They do not measure physical frame rates or certify every populated flow. These source changes are not yet installed on the physical phone.
