import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defaultProfile } from "../src/services/seed";

const native = vi.hoisted(() => ({
  location: {
    hasServicesEnabledAsync: vi.fn(),
    getForegroundPermissionsAsync: vi.fn(),
    requestForegroundPermissionsAsync: vi.fn(),
    requestBackgroundPermissionsAsync: vi.fn(),
    hasStartedLocationUpdatesAsync: vi.fn(),
    startLocationUpdatesAsync: vi.fn(),
    stopLocationUpdatesAsync: vi.fn(),
    Accuracy: { BestForNavigation: 6 },
    ActivityType: { Fitness: 3 },
  },
  app: { currentState: "active", addEventListener: vi.fn() },
  defineTask: vi.fn(),
}));
vi.mock("expo-location", () => native.location);
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: native.app,
}));
vi.mock("expo-task-manager", () => ({
  isTaskDefined: () => false,
  defineTask: native.defineTask,
}));
vi.mock("expo-crypto", () => ({ randomUUID: () => "workout" }));
vi.mock("../src/services/telemetry", () => ({ capture: vi.fn() }));
vi.mock("../src/storage/database", async () => {
  const { MemoryDatabase } = await import("../src/storage/port");
  return { database: new MemoryDatabase() };
});
const allowed = { granted: true, canAskAgain: true, ios: { accuracy: "full" } };
let service: typeof import("../src/services/recording");

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.useFakeTimers();
  native.app.currentState = "active";
  native.app.addEventListener.mockReturnValue({ remove: vi.fn() });
  native.location.hasServicesEnabledAsync.mockResolvedValue(true);
  native.location.getForegroundPermissionsAsync.mockResolvedValue(allowed);
  native.location.requestForegroundPermissionsAsync.mockResolvedValue(allowed);
  native.location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  native.location.startLocationUpdatesAsync.mockResolvedValue(undefined);
  native.location.stopLocationUpdatesAsync.mockResolvedValue(undefined);
  service = await import("../src/services/recording");
  await service.engine.discard();
});
afterEach(() => vi.useRealTimers());

describe("native recording startup", () => {
  it("starts with While Using permission and persists before native GPS starts", async () => {
    const stages: string[] = [];
    native.location.startLocationUpdatesAsync.mockImplementation(async () => {
      expect((await service.engine.active())?.state).toBe("recording");
    });
    await service.startRecording(
      defaultProfile("athlete"),
      "run",
      false,
      undefined,
      (stage) => stages.push(stage),
    );
    expect(stages).toEqual(["permission", "starting"]);
    expect(
      native.location.requestBackgroundPermissionsAsync,
    ).not.toHaveBeenCalled();
    expect(native.location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      "rivl-background-location-v1",
      expect.objectContaining({
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
      }),
    );
  });

  it.each([
    ["services", "Location Services are off"],
    ["denied", "Allow location while using"],
    ["approximate", "Precise Location is off"],
  ])(
    "explains %s failure without leaving a phantom workout",
    async (problem, message) => {
      if (problem === "services")
        native.location.hasServicesEnabledAsync.mockResolvedValue(false);
      if (problem === "denied")
        native.location.getForegroundPermissionsAsync.mockResolvedValue({
          granted: false,
          canAskAgain: false,
        });
      if (problem === "approximate")
        native.location.getForegroundPermissionsAsync.mockResolvedValue({
          ...allowed,
          ios: { accuracy: "reduced" },
        });
      await expect(
        service.startRecording(defaultProfile("athlete"), "run"),
      ).rejects.toThrow(message);
      expect(await service.engine.active()).toBeNull();
      expect(native.location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    },
  );

  it("waits for the permission sheet to return the app to the foreground", async () => {
    const remove = vi.fn();
    let active: ((state: string) => void) | undefined;
    native.app.currentState = "inactive";
    native.app.addEventListener.mockImplementation((_event, listener) => {
      active = listener;
      return { remove };
    });
    const work = service.startRecording(defaultProfile("athlete"), "run");
    await vi.advanceTimersByTimeAsync(20);
    expect(native.location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    native.app.currentState = "active";
    active?.("active");
    await work;
    expect(remove).toHaveBeenCalledOnce();
    expect((await service.engine.active())?.state).toBe("recording");
  });

  it("keeps a failed native start paused and can resume after retry", async () => {
    native.location.startLocationUpdatesAsync.mockRejectedValueOnce(
      new Error("foreground service failed"),
    );
    await expect(
      service.startRecording(defaultProfile("athlete"), "run"),
    ).rejects.toThrow("couldn’t start");
    expect((await service.engine.active())?.state).toBe("paused");
    expect((await service.engine.stats("workout")).error).toContain(
      "couldn’t start",
    );
    await service.resumeRecording("athlete");
    expect((await service.engine.active())?.state).toBe("recording");
    expect((await service.engine.stats("workout")).error).toBeNull();
  });

  it("times out GPS startup and stops a late native source before resuming", async () => {
    let settle: (() => void) | undefined;
    native.location.startLocationUpdatesAsync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const result = service.startRecording(defaultProfile("athlete"), "run");
    const rejected = expect(result).rejects.toThrow(
      "If Resume is still blocked, close RIVL from the app switcher and reopen it",
    );
    await vi.advanceTimersByTimeAsync(12001);
    await rejected;
    expect((await service.engine.active())?.state).toBe("paused");
    await expect(service.resumeRecording("athlete")).rejects.toThrow(
      "Close RIVL from the app switcher and reopen it",
    );
    native.location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    settle?.();
    await vi.advanceTimersByTimeAsync(1);
    expect(native.location.stopLocationUpdatesAsync).toHaveBeenCalledOnce();
    native.location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    await service.resumeRecording("athlete");
    expect((await service.engine.active())?.state).toBe("recording");
  });

  it("does not let another athlete attach to or resume the retained recording", async () => {
    await service.startRecording(defaultProfile("athlete"), "run");
    await service.pauseRecording();
    await expect(service.resumeRecording("someone-else")).rejects.toThrow(
      "another athlete",
    );
    await service.recoverRecording("someone-else");
    expect((await service.engine.active())?.state).toBe("paused");
    expect(native.location.startLocationUpdatesAsync).toHaveBeenCalledOnce();
  });

  it("gives restart guidance without overlapping a permanently stalled native start", async () => {
    native.location.startLocationUpdatesAsync.mockReturnValue(
      new Promise<void>(() => {}),
    );
    const start = service.startRecording(defaultProfile("athlete"), "run");
    const failed = expect(start).rejects.toThrow("Your workout is paused");
    await vi.advanceTimersByTimeAsync(12001);
    await failed;
    for (let retry = 0; retry < 2; retry++) {
      await expect(service.resumeRecording("athlete")).rejects.toThrow(
        "Close RIVL from the app switcher and reopen it",
      );
      await vi.advanceTimersByTimeAsync(60000);
    }
    expect(native.location.startLocationUpdatesAsync).toHaveBeenCalledOnce();
    expect((await service.engine.active())?.state).toBe("paused");
  });

  it("bounds a native stop failure without losing the saved route", async () => {
    await service.startRecording(defaultProfile("athlete"), "run");
    const start = (await service.engine.active())!.startedAt;
    await service.engine.ingest([
      { lat: 0, lng: 0, t: start, accuracy: 5, segment: 0 },
      { lat: 0, lng: 0.0001, t: start + 5000, accuracy: 5, segment: 0 },
    ]);
    native.location.hasStartedLocationUpdatesAsync.mockReturnValue(
      new Promise(() => {}),
    );
    const result = service.pauseRecording();
    const rejected = expect(result).rejects.toThrow("GPS didn’t respond");
    await vi.advanceTimersByTimeAsync(8001);
    await rejected;
    expect((await service.engine.active())?.state).toBe("paused");
    const stats = await service.engine.stats("workout");
    expect(stats.count).toBe(2);
    expect(stats.currentSpeed).toBe(0);
  });
});
