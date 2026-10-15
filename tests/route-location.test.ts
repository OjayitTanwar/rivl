import { beforeEach, expect, it, vi } from "vitest";
const location = vi.hoisted(() => ({
  permission: vi.fn(),
  cached: vi.fn(),
  current: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: location.permission,
  getLastKnownPositionAsync: location.cached,
  getCurrentPositionAsync: location.current,
  Accuracy: { Balanced: 3 },
}));
import { plannerLocation } from "../src/services/route-location";
beforeEach(() => {
  vi.resetAllMocks();
  location.permission.mockResolvedValue({ granted: true });
  location.current.mockResolvedValue({
    coords: { latitude: 51.5, longitude: -0.1 },
  });
});
it("gets a fresh fix even when the device's cached position is unavailable", async () => {
  location.cached.mockRejectedValue(new Error("No cached location"));
  await expect(plannerLocation()).resolves.toEqual({ lat: 51.5, lng: -0.1 });
  expect(location.current).toHaveBeenCalledTimes(1);
});
it("never requests a location fix when permission is denied", async () => {
  location.permission.mockResolvedValue({ granted: false });
  await expect(plannerLocation()).rejects.toMatchObject({ kind: "forbidden" });
  expect(location.current).not.toHaveBeenCalled();
  expect(location.cached).not.toHaveBeenCalled();
});
