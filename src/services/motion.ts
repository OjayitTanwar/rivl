import { requireOptionalNativeModule } from "expo-modules-core";
import type { MotionSignal } from "../domain/exercise-detection";
interface MotionBridge {
  requestPermission(): Promise<boolean>;
  start(): Promise<boolean>;
  stop(): Promise<void>;
  addListener(
    name: "activity",
    handler: (signal: MotionSignal) => void,
  ): { remove(): void };
}
export const motionBridge =
  requireOptionalNativeModule<MotionBridge>("RivlMotion");
