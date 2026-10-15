import { describe, expect, it, vi } from "vitest";
import {
  importRecipeUrl,
  parseRecipePage,
  publicRecipeUrl,
} from "../src/services/recipe-import";
const page = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
describe("recipe website import", () => {
  it("reads graph recipe metadata without assuming grams or nutrients", () => {
    expect(
      parseRecipePage(
        page({
          "@graph": [
            {
              "@type": "Recipe",
              name: "<b>Soup</b>",
              recipeIngredient: ["2 cups lentils", "salt"],
              nutrition: { calories: "500" },
            },
          ],
        }),
        "https://recipes.org/soup#top",
      ),
    ).toEqual({
      name: "Soup",
      ingredients: ["2 cups lentils", "salt"],
      sourceUrl: "https://recipes.org/soup",
    });
  });
  it("rejects private, insecure and credential-bearing links", () => {
    for (const url of [
      "http://recipes.org",
      "https://localhost",
      "https://192.168.0.1",
      "https://[::1]",
      "https://foo.local",
      "https://u:p@recipes.org",
      "https://recipes.org:9000",
    ])
      expect(() => publicRecipeUrl(url)).toThrow();
  });
  it("rejects unsupported, malformed, excess and oversized data", () => {
    for (const html of [
      page({
        "@type": "Recipe",
        name: "A",
        recipeIngredient: Array(51).fill("x"),
      }),
      page({ "@type": "Recipe", name: "A", recipeIngredient: [42] }),
      "<script>bad</script>",
      "x".repeat(500001),
    ])
      expect(() => parseRecipePage(html, "https://recipes.org")).toThrow();
  });
  it("fetches explicitly without credentials or redirects and retains provenance", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(
          page({
            "@type": "Recipe",
            name: "Rice",
            recipeIngredient: ["100g rice"],
          }),
          { headers: { "content-type": "text/html" } },
        ),
      );
    expect(
      (await importRecipeUrl("https://recipes.org/rice", fetcher)).name,
    ).toBe("Rice");
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      redirect: "error",
      credentials: "omit",
    });
  });
  it("bounds streaming response size and rejects non HTML", async () => {
    for (const response of [
      new Response("x", { headers: { "content-type": "application/json" } }),
      new Response("x".repeat(500001), {
        headers: { "content-type": "text/html" },
      }),
    ])
      await expect(
        importRecipeUrl(
          "https://recipes.org",
          vi.fn().mockResolvedValue(response),
        ),
      ).rejects.toThrow();
  });
});
