const { withEntitlementsPlist, withXcodeProject, withFinalizedMod } = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

// RIVL schedules local reminders; it does not register remote push tokens.
// Avoid requiring paid-team APNs provisioning for direct device installation.
module.exports = function withLocalReminders(config) {
  config = withEntitlementsPlist(config, (mod) => {
    delete mod.modResults["aps-environment"];
    return mod;
  });
  config = withXcodeProject(config, (mod) => {
    for (const project of Object.values(mod.modResults.pbxProjectSection())) {
      const targets = project?.attributes?.TargetAttributes ?? {};
      for (const target of Object.values(targets)) {
        if (target.SystemCapabilities) delete target.SystemCapabilities["com.apple.Push"];
      }
    }
    return mod;
  });
  // Expo's automatic notification plugin can add APNs after custom entitlement mods.
  return withFinalizedMod(config, ["ios", async (mod) => {
    const file = path.join(mod.modRequest.platformProjectRoot, "RIVL", "RIVL.entitlements");
    const text = await fs.readFile(file, "utf8");
    await fs.writeFile(file, text.replace(/\s*<key>aps-environment<\/key>\s*<string>[^<]*<\/string>/g, ""));
    return mod;
  }]);
};
