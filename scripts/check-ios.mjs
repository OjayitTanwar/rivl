import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const candidate = "/Applications/Xcode.app/Contents/Developer";
if (!existsSync(candidate)) {
  console.error(
    "Xcode is not installed yet. Install Xcode from the Mac App Store, open it once, and install an iOS Simulator runtime.",
  );
  process.exit(1);
}
const env = { ...process.env, DEVELOPER_DIR: candidate };
for (const [cmd, args] of [
  ["xcodebuild", ["-version"]],
  ["xcrun", ["--sdk", "iphonesimulator", "--show-sdk-version"]],
  ["xcrun", ["simctl", "list", "devices", "available"]],
]) {
  console.log(execFileSync(cmd, args, { env, encoding: "utf8" }));
}
