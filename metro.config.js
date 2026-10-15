const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(__dirname);
config.resolver.useWatchman = false;
const root = __dirname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Native build products contain transient framework symlinks, not JS sources.
const nativeArtifacts = new RegExp(
  `^${root}/(?:build|ios/Pods|android/(?:build|app/build|\\.gradle))(?:/|$)`,
);
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  nativeArtifacts,
];
module.exports = config;
