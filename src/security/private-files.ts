import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import { AppFailure } from "./errors";
let preparing: Promise<void> | null = null;
export function preparePrivateFiles(): Promise<void> {
  if (Platform.OS !== "ios") return Promise.resolve();
  if (!preparing) {
    const native = requireOptionalNativeModule<{ prepare(): Promise<void> }>(
      "RivlPrivateFiles",
    );
    if (!native)
      return Promise.reject(
        new AppFailure(
          "storage",
          "Rebuild RIVL to enable protected workout files.",
        ),
      );
    preparing = native.prepare().catch((error) => {
      preparing = null;
      throw error;
    });
  }
  return preparing;
}
