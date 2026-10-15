import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Expo 55's plist caller omits MIME. The patched XML parser requires it explicitly.
const path = require.resolve("@expo/plist/build/parse.js");
const source = await readFile(path, "utf8");
if (source.includes(".parseFromString(xml);"))
  await writeFile(
    path,
    source.replace(
      ".parseFromString(xml);",
      '.parseFromString(xml, "application/xml");',
    ),
  );
// macOS FileProvider can race folder removal when switching RN prebuilt variants.
const rn = require.resolve("react-native/scripts/replace-rncore-version.js");
const code = await readFile(rn, "utf8");
if (code.includes("fs.rmSync(finalLocation, {force: true, recursive: true});"))
  await writeFile(
    rn,
    code.replace(
      "fs.rmSync(finalLocation, {force: true, recursive: true});",
      "fs.rmSync(finalLocation, {force: true, recursive: true, maxRetries: 10, retryDelay: 200});",
    ),
  );
// apple-targets 5 removes the target reference before using its configuration list again.
const target =
  require.resolve("@bacons/apple-targets/build/with-xcode-changes.js");
const plugin = await readFile(target, "utf8");
const begin = plugin.indexOf(
    "    if (targetToUpdate) {\n        // Remove existing build phases",
  ),
  end = plugin.indexOf("        // Create new build phases", begin);
if (
  begin >= 0 &&
  end > begin &&
  !plugin.includes("const existingConfigurations =")
) {
  const block = plugin
    .slice(begin, end)
    .replace(
      "// Remove existing build phases",
      "const existingConfigurations = targetToUpdate.props.buildConfigurationList;\n        // Remove existing build phases",
    )
    .replaceAll(
      "targetToUpdate.props.buildConfigurationList",
      "existingConfigurations",
    )
    .replace(
      "const existingConfigurations = existingConfigurations;",
      "const existingConfigurations = targetToUpdate.props.buildConfigurationList;",
    );
  await writeFile(target, plugin.slice(0, begin) + block + plugin.slice(end));
}
// Construct the replacement while the original target still has valid settings.
const patched = await readFile(target, "utf8");
if (
  patched.includes(
    "const existingConfigurations = targetToUpdate.props.buildConfigurationList;",
  ) &&
  !patched.includes("const replacementConfigurations =")
)
  await writeFile(
    target,
    patched
      .replace(
        "const existingConfigurations = targetToUpdate.props.buildConfigurationList;",
        "const existingConfigurations = targetToUpdate.props.buildConfigurationList;\n        const replacementConfigurations = (0, configuration_list_1.createConfigurationListForType)(project, props);",
      )
      .replace(
        "targetToUpdate.props.buildConfigurationList =\n            (0, configuration_list_1.createConfigurationListForType)(project, props);",
        "targetToUpdate.props.buildConfigurationList = replacementConfigurations;",
      ),
  );
