import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
function preflight(extra: Record<string, string> = {}) {
  const result = spawnSync(
    process.execPath,
    ["scripts/security-preflight.mjs", "--production"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        EXPO_PUBLIC_ENABLE_DEMO: "false",
        EXPO_PUBLIC_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
        EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "",
        EXPO_PUBLIC_MAP_STYLE_URL: "",
        RIVL_PINNED_HOST: "",
        RIVL_TLS_SPKI_PINS: "",
        ...extra,
      },
    },
  );
  return { status: result.status, output: result.stdout + result.stderr };
}
describe("production map configuration", () => {
  it("does not require a custom style for Google-only builds and still requires operated API pins", () => {
    const result = preflight();
    expect(result.output).not.toContain("MAP_STYLE_URL");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain("current/backup API pins");
  });
  it("accepts built-in Mapbox styles but rejects an explicitly insecure custom style", () => {
    const defaults = preflight({ EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "pk.test" });
    expect(defaults.output).not.toContain("MAP_STYLE_URL");
    const insecure = preflight({
      EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "pk.test",
      EXPO_PUBLIC_MAP_STYLE_URL: "http://example.test/style.json",
    });
    expect(insecure.output).toContain(
      "EXPO_PUBLIC_MAP_STYLE_URL must be a valid HTTPS service URL",
    );
  });
  it("continues rejecting secret Mapbox tokens and demo production builds", () => {
    const result = preflight({
      EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN: "sk.invalid",
      EXPO_PUBLIC_ENABLE_DEMO: "true",
    });
    expect(result.output).toContain("requires a public pk. token");
    expect(result.output).toContain("disable development accounts");
  });
});
