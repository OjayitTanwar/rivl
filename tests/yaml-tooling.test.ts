import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
describe("scoped coverage YAML tooling override", () => {
  it("loads legitimate coverage configuration through the existing loader", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rivl-yaml-"));
    try {
      await writeFile(join(directory, "package.json"), '{"private":true}');
      await writeFile(
        join(directory, ".nycrc.yaml"),
        'all: true\ninclude:\n  - "src/**/*.ts"\nexclude:\n  - "**/*.test.ts"\nextension: .ts\n',
      );
      const { loadNycConfig } = require("@istanbuljs/load-nyc-config");
      expect(await loadNycConfig({ cwd: directory })).toMatchObject({
        all: true,
        include: ["src/**/*.ts"],
        exclude: ["**/*.test.ts"],
        extension: [".ts"],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("keeps malicious precision text as YAML data without the vulnerable sprintf dependency path", () => {
    const loaderRequire = createRequire(
      require.resolve("@istanbuljs/load-nyc-config"),
    );
    const yaml = loaderRequire("js-yaml");
    const yamlRequire = createRequire(loaderRequire.resolve("js-yaml"));
    expect(loaderRequire("js-yaml/package.json").version).toBe("4.3.2");
    expect(yamlRequire("argparse/package.json").version).toMatch(/^2\./);
    expect(yaml.load('include: ["%.1000000000f"]')).toEqual({
      include: ["%.1000000000f"],
    });
    expect(() => yamlRequire.resolve("sprintf-js")).toThrow();
  });
});
