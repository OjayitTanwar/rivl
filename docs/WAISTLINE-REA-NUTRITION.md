# Waistline packaged nutrition inspection

14 October 2026. Reference: official [Waistline 3.11.1 release](https://github.com/davidhealey/waistline/releases/tag/3.11.1), downloaded for static study without installation. The bounded static REA inspection of three packaged JavaScript files is complete. No app was installed and no competitor code or assets were copied into RIVL.

## Identity and retained evidence

- Downloaded APK (removed after the selected inspection): `/private/tmp/rivl-waistline-3.11.1.apk`; SHA-256 `7870e08d3e8ef07159549fece8378d2b4da3a98efbbd173a3c0f8128964d7bf1`.
- REA archive inventory: `ev_0cce4b896dd7b3f82a42d85060f2bd9dbcc37df1c8ff001d5f1f161fcd06922f`.
- Full extraction was rejected because two Android resource names differ only by case on this host. It was not retried. A bounded regular-file extraction of `assets/www/` preserved original paths, bytes and hashes in an extraction manifest. Retained provenance is `/private/tmp/rivl-waistline-extraction-provenance.json`; the temporary `/private/tmp/rivl-waistline-web-3.11.1/` source extraction was removed after the selected inspection completed.
- REA analysis of three explicitly selected packaged files: `activities/diary/js/diary.js`, `activities/recipes/js/recipe-editor.js`, and `activities/foodlist/js/open-food-facts.js`. Parent Evidence `ev_e4cfa315d3ce8f1d8f0ccc9140b1636c125bbe30365d12607ceda85756738da5`; summary `ev_bde1879d3f11ef3d2b42420b8217a7dbe20a252f6ceecd77cfbee20eff862ac9`.
- Export: `/private/tmp/rivl-waistline-rea-evidence.json`. All three selected JS files parsed; semantic call/data relationships remain partial, with 2,286 unknowns. This is not whole-app or runtime verification.

## Observations and independent RIVL choices

The packaged diary prompts for portion and quantity before adding named food items, then writes the diary after processing the items (diary.js:644–680). RIVL already requires an explicit measured gram portion and save. The useful interaction is confirmation before a diary write, rather than logging a search result immediately.

The packaged recipe editor retains ingredient items and computes a nutrition object before saving the recipe (recipe-editor.js:237–273). RIVL uses its own measured-ingredient snapshots and prepared yield weight; changing a recipe must not silently rewrite previously eaten meals. The external dependency implementing recipe total calculation was outside the selected slice, so its complete algorithm is unknown.

The food parser explicitly selects serving versus per-100g fields, and checks for absent nutriments (open-food-facts.js:101–220). RIVL's independent decoder preserves missing nutrients as unknown, measured zero as zero, and refuses a millilitre basis without measured density. The competitor parser is not validation authority: its observed truthiness checks for calories do not establish correct zero handling.

These findings support the existing explicit portion, provenance, unknown-value and immutable-history design. They do not establish visual dimensions, keyboard behavior, live API responses or correctness of either application's full runtime.

## Provider boundary

The [official Open Food Facts API guidance](https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md) identifies v3.6, requests an application/contact User-Agent, limits search to 10 requests/minute and product reads to 15/minute, and asks development integrations to use staging. RIVL spaces explicit search/product requests and never searches while typing. App registration/contact and live provider validation remain release work; this inspection made no food-provider requests.
