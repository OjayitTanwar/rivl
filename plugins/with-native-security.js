const {
  withInfoPlist,
  withAndroidManifest,
  withDangerousMod,
  withPodfile,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");
function pinConfiguration(host, values) {
  if (!host && !values) return null;
  if (
    !host ||
    !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
      host,
    )
  )
    throw new Error(
      "RIVL_PINNED_HOST must be a DNS hostname without a scheme or path.",
    );
  const pins = [
    ...new Set(
      (values ?? "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    ),
  ];
  if (
    pins.length < 2 ||
    pins.some(
      (p) =>
        !/^[A-Za-z0-9+/]{43}=$/.test(p) ||
        Buffer.from(p, "base64").length !== 32 ||
        Buffer.from(p, "base64").toString("base64") !== p,
    )
  )
    throw new Error(
      "Provide at least two distinct SHA-256 SPKI pins: the current key and an independently controlled backup key.",
    );
  return { host: host.toLowerCase(), pins };
}
function androidNetworkXml(pinning, debug = false) {
  const domains = pinning
    ? `<domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">${pinning.host}</domain><pin-set>${pinning.pins.map((p) => `<pin digest="SHA-256">${p}</pin>`).join("")}</pin-set></domain-config>`
    : "";
  return `<?xml version="1.0" encoding="utf-8"?><network-security-config><base-config cleartextTrafficPermitted="${debug}"><trust-anchors><certificates src="system"/></trust-anchors></base-config>${domains}</network-security-config>`;
}
function withNativeSecurity(config) {
  config = withPodfile(config, c => {
    const marker = "# RIVL minimum iOS version for dependency resource bundles";
    if (!c.modResults.contents.includes(marker)) {
      c.modResults.contents = c.modResults.contents.replace("post_install do |installer|", `post_install do |installer|
    ${marker}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build|
        value = build.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if value.nil? || Gem::Version.new(value) < Gem::Version.new('16.0')
          build.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
        end
      end
    end`);
    }
    return c;
  });
  const pinning = pinConfiguration(
    process.env.RIVL_PINNED_HOST,
    process.env.RIVL_TLS_SPKI_PINS,
  );
  config = withInfoPlist(config, (c) => {
    c.modResults.NSAppTransportSecurity = {
      NSAllowsArbitraryLoads: false,
      NSAllowsLocalNetworking: process.env.EAS_BUILD_PROFILE !== "production",
      ...(pinning
        ? {
            NSPinnedDomains: {
              [pinning.host]: {
                NSIncludesSubdomains: false,
                NSPinnedLeafIdentities: pinning.pins.map((pin) => ({
                  "SPKI-SHA256-BASE64": pin,
                })),
              },
            },
          }
        : {}),
    };
    c.modResults.UIFileSharingEnabled = false;
    c.modResults.LSSupportsOpeningDocumentsInPlace = false;
    return c;
  });
  config = withAndroidManifest(config, (c) => {
    const application = c.modResults.manifest.application[0].$;
    application["android:usesCleartextTraffic"] = "false";
    application["android:allowBackup"] = "false";
    application["android:networkSecurityConfig"] = "@xml/rivl_network_security";
    application["android:fullBackupContent"] = "@xml/rivl_backup_rules";
    application["android:dataExtractionRules"] = "@xml/rivl_extraction_rules";
    return c;
  });
  return withDangerousMod(config, [
    "android",
    async (c) => {
      const dir = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      await fs.mkdir(dir, { recursive: true });
      const exclusions = [
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
        "device_root",
        "device_file",
        "device_database",
        "device_sharedpref",
      ]
        .map((domain) => `<exclude domain="${domain}" path="."/>`)
        .join("");
      await fs.writeFile(
        path.join(dir, "rivl_network_security.xml"),
        androidNetworkXml(pinning),
      );
      const debugDir = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/debug/res/xml",
      );
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(
        path.join(debugDir, "rivl_network_security.xml"),
        androidNetworkXml(pinning, true),
      );
      await fs.writeFile(
        path.join(dir, "rivl_backup_rules.xml"),
        `<?xml version="1.0" encoding="utf-8"?><full-backup-content>${exclusions}</full-backup-content>`,
      );
      await fs.writeFile(
        path.join(dir, "rivl_extraction_rules.xml"),
        `<?xml version="1.0" encoding="utf-8"?><data-extraction-rules><cloud-backup>${exclusions}</cloud-backup><device-transfer>${exclusions}</device-transfer></data-extraction-rules>`,
      );
      return c;
    },
  ]);
}
module.exports = withNativeSecurity;
module.exports.pinConfiguration = pinConfiguration;
module.exports.androidNetworkXml = androidNetworkXml;
