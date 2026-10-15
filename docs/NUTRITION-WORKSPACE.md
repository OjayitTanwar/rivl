# Nutrition workspace — 14 October 2026

Implemented in `/nutrition` and `/nutrition-insights`, within the shared Home workspace stack. Home links Activity, Health, Nutrition and Guided training; Sleep belongs inside Health and You/settings are Home destinations. Four persistent global tabs—Home, Maps, Record and Groups—remain visible, including Record entry, and moved URLs are preserved. Workspace selection does not change recording state. The surface inherits Native Operate: flat titled sections, theme-aware system typography, shared 56-unit Field/Choice controls and coral actions. It adds no bottom-bar destination, native dependency, camera permission or phone installation.

## Diary

Actual entries are grouped into breakfast, lunch, dinner and snacks for a device-local calendar date. Users add, edit and delete weighed gram amounts. Calories are kcal; protein, carbohydrate and fat are grams per 100 grams of food. Amounts scale by the recorded gram portion. Blank nutrient fields remain unknown; measured zero remains zero. Daily totals expose incomplete values rather than presenting unknown nutrition as zero. A date can represent a past meal or a planned future entry; it does not imply food was automatically eaten.

Manual food values come from the user's label entry. Selecting a packaged food snapshots its Open Food Facts product name, brand, barcode, retrieval time and available nutrient values. Editing label values replaces the database provenance with manual provenance. Missing measurements are never manufactured from calories or food names. Foods explicitly using a 100 ml basis are excluded because no mass-density conversion is available.

The repository uses `nutrition:<ownerId>:<entryId>`. A per-database, per-owner queue serializes writes across instances, snapshots inputs and checks the exact expected previous entry before edits or deletes. Writes require the currently stored session to match the owner. `NutritionRepository.purge(ownerId)` removes one owner's records using that queue and is integrated into account-data removal alongside nutrition planning. Failed writes preserve original records. Lists initially display at most 50 entries per meal, with Show more for the rest.

## Packaged-food lookup

Lookup is explicitly submitted by name or the printed 8–14 digit barcode. This is typed barcode lookup, not a camera scanner. No diary, account, sensor or health payload is sent. Food-name text or barcode is sent directly to the public database, so normal provider network logging applies.

Open Food Facts product requests use `/api/v3.6/product`; the documented legacy text-search endpoint `/cgi/search.pl` remains available for explicit product search. Results are bounded to 20 products and a 500 KB response. The existing `apiJson` keeps the 12-second deadline and cancellation active through body decoding. Foreground lifecycle cleanup aborts outstanding lookups; late responses cannot replace a different account's data. Client spacing is 6.5 seconds for search and 4.5 seconds for barcode, with no search-as-you-type or automatic retry.

Source attribution is visible in the app and retained in each selected food. Database reuse is under ODbL; data contents are under Database Contents License. No food photographs or assets are downloaded. A public derivative catalogue/export requires the corresponding ODbL treatment; this implementation stores the selected record's provenance alongside the private diary.

Before release configure `EXPO_PUBLIC_FOOD_LOOKUP_CONTACT` with a real maintainer contact and complete the provider's API usage registration. The request already identifies `RIVL/1.0` in its User-Agent; no contact address or provider account is invented. React Native/iOS header behavior and actual public search/barcode responses still need a bounded live device verification. Tests use fixtures and request doubles, not live provider traffic.

Official references:

- [API introduction, identifiers, rate limits and API versions](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Licence and reuse guidance](https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/)
- [Product API v3 reference](https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/)

## Targets, reports, recipes and planning

`/nutrition-insights` uses the same flat SettingsSection, shared Field/Choice/Button and theme tokens for Report, Goals, Plan and Recipes. Personal calorie and gram macro targets are explicit user choices, not generated dietary advice. Seven-day reports/export describe actual logged intake; missing days and incomplete measurements remain unavailable rather than becoming zero.

Reusable recipes snapshot measured ingredient foods and gram amounts plus the prepared yield in grams. Portions scale nutrient totals by the recorded yield; missing ingredient nutrients remain unknown. Seven-day planned food/recipe portions are stored separately from eaten entries. Grocery quantities expand planned recipe portions into ingredient grams; package sizes, cooking losses, retailer orders and automatic intake are not inferred. The owner-scoped planning repository uses serialized writes, expected-record conflict checks, bounded records and account purge integration.

Same-owner unsaved editors survive focus switches; changing owners resets drafts. Shared LabelValueRow displays diary totals, report/recipe macros and grocery quantities without label/value overlap: it stacks at fontScale >= 1.3 or window width < 320, otherwise retains a flexible label and right-aligned bounded value. The native Nutrition draft round trip through Groups and Home was captured without writing a food entry.

## Verification and limits

Final whole-project checks passed at 21:09: TypeScript, **388 tests across 60 suites** and development security preflight. Nutrition fixture/request-double tests cover gram scaling, unknown/zero semantics, validation, owner/session isolation, conflicts, snapshots, lookup decoding/throttling/failures, measured recipe yields, reports, planning and derived groceries; they do not verify live provider traffic.

The workspace capture matrix in `.impeccable/review/workspaces-oct14/` includes dark/light entry and empty-form screens and iOS accessibility-medium enlarged screens; normal text was restored afterwards. The enlarged macro overlap is fixed in source with shared LabelValueRow. The corrected enlarged goals capture was recorded at 21:03 and the workspace reviewer returned ship for its two scored documentation/navigation and macro-layout fixes. This narrow correction approval does not establish whole-workspace approval. Keyboard avoidance, populated flows, Android and physical-device behavior remain outside this verification. Provider contact/registration, live public lookup and hosted/service integration still require release checks.

Camera scanning, photo/voice estimates, recipe URL imports, micronutrient coverage, retailer/service connections and configurable meal/day-specific scheduling remain queued. This document records the implemented diary and planning workspace without claiming the full nutrition wishlist is complete.
