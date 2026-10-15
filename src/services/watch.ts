import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";
import type { Profile, RoutePlan } from "../domain/types";
type Bridge = {
  status(): Promise<{
    supported: boolean;
    paired: boolean;
    installed: boolean;
    reachable: boolean;
  }>;
  setContext(
    owner: string,
    name: string,
    route: { lat: number; lng: number }[],
  ): Promise<void>;
  inbox(owner: string): Promise<string[]>;
  acknowledge(owner: string, id: string): Promise<void>;
  purge(owner: string): Promise<void>;
};
export const watchBridge =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<Bridge>("RivlWatch")
    : null;
export async function connectWatch(profile: Profile | null, route?: RoutePlan) {
  const points = route?.points ?? [],
    stride = Math.max(1, Math.ceil(points.length / 900));
  await watchBridge?.setContext(
    profile?.id ?? "",
    profile?.name ?? "",
    points
      .filter((_, i) => i % stride === 0 || i === points.length - 1)
      .map((p) => ({ lat: p.lat, lng: p.lng })),
  );
}
