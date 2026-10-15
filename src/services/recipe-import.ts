import { AppFailure } from "../security/errors";
export type RecipePreview = {
  name: string;
  sourceUrl: string;
  ingredients: string[];
};
const fail = (message: string): never => {
  throw new AppFailure("validation", message);
};
export function publicRecipeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return fail("Enter a complete HTTPS recipe link.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(host) ||
    /^\d+(?:\.\d+)*$/.test(host)
  )
    fail("Choose a public HTTPS recipe website.");
  url.hash = "";
  if (url.href.length > 2000) fail("This recipe link is too long.");
  return url.href;
}
const clean = (value: unknown, limit: number) =>
  typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, limit)
    : "";
export function parseRecipePage(
  html: string,
  sourceUrl: string,
): RecipePreview {
  const source = publicRecipeUrl(sourceUrl);
  if (new TextEncoder().encode(html).length > 500000)
    fail("This page is too large to import.");
  const found: Record<string, unknown>[] = [];
  const visit = (value: unknown, depth = 0) => {
    if (depth > 12 || found.length > 20) return;
    if (Array.isArray(value)) {
      for (const child of value.slice(0, 100)) visit(child, depth + 1);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const types = Array.isArray(node["@type"])
      ? node["@type"]
      : [node["@type"]];
    if (
      types.some(
        (t) =>
          t === "Recipe" ||
          t === "https://schema.org/Recipe" ||
          t === "http://schema.org/Recipe",
      )
    )
      found.push(node);
    if (node["@graph"]) visit(node["@graph"], depth + 1);
    if (node.mainEntity) visit(node.mainEntity, depth + 1);
  };
  for (const match of html.matchAll(
    /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
  )) {
    try {
      visit(JSON.parse(match[1]!));
    } catch {
      /* Other structured data can be malformed. */
    }
  }
  const recipe = found.find(
    (r) => Array.isArray(r.recipeIngredient) && r.recipeIngredient.length > 0,
  );
  if (!recipe)
    fail("No supported recipe data found. Create a measured recipe manually.");
  const rows = recipe!.recipeIngredient as unknown[];
  if (
    rows.length > 50 ||
    rows.some(
      (row) => typeof row !== "string" || !row.trim() || row.length > 500,
    )
  )
    fail("This recipe has unsupported ingredients. Create it manually.");
  const name = clean(recipe!.name, 100);
  if (!name) fail("This recipe has no usable title.");
  return {
    name,
    sourceUrl: source,
    ingredients: rows.map((row) => clean(row, 500)),
  };
}
export async function importRecipeUrl(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<RecipePreview> {
  const url = publicRecipeUrl(value),
    controller = new AbortController();
  let rejectDeadline: (error: unknown) => void = () => {};
  const deadline = new Promise<never>((_, reject) => {
    rejectDeadline = reject;
  });
  const timeout = setTimeout(() => {
    controller.abort();
    rejectDeadline(
      new AppFailure("validation", "Recipe import timed out. Try again."),
    );
  }, 12000);
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetcher(url, {
          signal: controller.signal,
          redirect: "error",
          credentials: "omit",
          headers: { Accept: "text/html,application/xhtml+xml" },
        });
        if (!response.ok || response.redirected)
          fail(
            "The recipe page could not be opened. Use its final direct link.",
          );
        if (
          !/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(
            response.headers.get("content-type") ?? "",
          )
        )
          fail("Choose a recipe webpage.");
        if (Number(response.headers.get("content-length")) > 500000)
          fail("This page is too large to import.");
        let html: string;
        if (response.body?.getReader) {
          const reader = response.body.getReader(),
            decoder = new TextDecoder();
          let bytes = 0;
          html = "";
          try {
            while (true) {
              const next = await reader.read();
              if (next.done) break;
              bytes += next.value.byteLength;
              if (bytes > 500000) {
                controller.abort();
                fail("This page is too large to import.");
              }
              html += decoder.decode(next.value, { stream: true });
            }
            html += decoder.decode();
          } finally {
            await reader.cancel().catch(() => undefined);
          }
        } else {
          // Native fetch does not expose a streaming reader; enforce declared and decoded bounds.
          html = await response.text();
        }
        if (controller.signal.aborted) fail("Recipe import cancelled.");
        return parseRecipePage(html, url);
      })(),
    ]);
  } catch (error) {
    if (error instanceof AppFailure) throw error;
    throw new AppFailure(
      "validation",
      "Could not import this page. Check the link and connection, or create the recipe manually.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
