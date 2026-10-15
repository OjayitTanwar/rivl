import { beforeEach, describe, expect, it, vi } from "vitest";

const speech = vi.hoisted(() => ({
  getAvailableVoicesAsync: vi.fn(),
  stop: vi.fn(),
  speak: vi.fn(),
}));
vi.mock("expo-speech", () => ({
  ...speech,
  VoiceQuality: { Default: "Default", Enhanced: "Enhanced" },
}));
const voice = (
  identifier: string,
  language = "en-US",
  quality = "Enhanced",
  name = identifier,
) => ({ identifier, language, quality, name });
const settle = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.resetModules();
  speech.getAvailableVoicesAsync
    .mockReset()
    .mockResolvedValue([voice("samantha.enhanced")]);
  speech.stop.mockReset().mockResolvedValue(undefined);
  speech.speak.mockReset();
});

describe("single navigation voice", () => {
  it("falls back when native voice discovery stalls and ignores its late result", async () => {
    vi.useFakeTimers();
    try {
      let resolve!: (voices: unknown[]) => void;
      speech.getAvailableVoicesAsync.mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const api = await import("../src/services/navigation-voice");
      api.speakNavigation("Turn right.");
      await settle();
      await vi.advanceTimersByTimeAsync(2000);
      await settle();
      expect(speech.speak.mock.calls[0]?.[0]).toBe("Turn right.");
      expect(speech.speak.mock.calls[0]?.[1].voice).toBeUndefined();
      resolve([voice("late.premium")]);
      await settle();
      expect(api.currentNavigationVoice()).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("prefers premium English and excludes novelty and Android network-only voices", async () => {
    const { chooseNavigationVoice } =
      await import("../src/services/navigation-voice");
    const voices = [
      voice("badnews.premium", "en-IN", "Enhanced", "Bad News (Premium)"),
      voice("hi-IN-premium", "hi-IN"),
      voice("en-in-x-network", "en-IN"),
      voice("rishi.enhanced", "en-IN"),
      voice("ava.premium"),
    ];
    expect(chooseNavigationVoice(voices as never)?.id).toBe("ava.premium");
    expect(chooseNavigationVoice(voices.reverse() as never)?.id).toBe(
      "ava.premium",
    );
  });

  it("keeps English locale preference deterministic within a quality tier", async () => {
    const { chooseNavigationVoice } =
      await import("../src/services/navigation-voice");
    expect(
      chooseNavigationVoice([
        voice("us"),
        voice("india", "en_IN"),
        voice("compact", "en-IN", "Default"),
      ] as never),
    ).toMatchObject({ id: "india", language: "en-IN", enhanced: true });
    expect(
      chooseNavigationVoice([voice("fr", "fr-FR")] as never),
    ).toBeUndefined();
  });

  it("shares discovery and retries a cold empty engine", async () => {
    const api = await import("../src/services/navigation-voice");
    speech.getAvailableVoicesAsync.mockResolvedValueOnce([]);
    await Promise.all([
      api.prepareNavigationVoice(),
      api.prepareNavigationVoice(),
    ]);
    expect(speech.getAvailableVoicesAsync).toHaveBeenCalledTimes(1);
    await api.prepareNavigationVoice();
    expect(api.currentNavigationVoice()?.id).toBe("samantha.enhanced");
  });

  it("replaces stale instructions even when the native stop resolves late", async () => {
    const api = await import("../src/services/navigation-voice");
    await api.prepareNavigationVoice();
    let resolveStop!: () => void;
    speech.stop.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    );
    api.speakNavigation("Turn left onto Station Road.");
    await settle();
    api.speakNavigation("Turn right onto Park Road.");
    resolveStop();
    await settle();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    expect(speech.speak.mock.calls[0]![0]).toBe("Turn right onto Park Road.");
  });

  it("mute or unmount cancels speech still waiting for discovery", async () => {
    let resolveVoices!: (value: unknown[]) => void;
    speech.getAvailableVoicesAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVoices = resolve;
        }),
    );
    const api = await import("../src/services/navigation-voice");
    api.speakNavigation("Turn left.");
    await settle();
    api.stopNavigationVoice();
    resolveVoices([voice("samantha.enhanced")]);
    await settle();
    expect(speech.speak).not.toHaveBeenCalled();
    expect(speech.stop).toHaveBeenCalled();
  });

  it("suppresses immediate duplicates but allows an explicit repeat", async () => {
    const api = await import("../src/services/navigation-voice");
    api.speakNavigation("Turn left in 200 metres.");
    await settle();
    api.speakNavigation("Turn left in 200 metres.");
    await settle();
    expect(speech.speak).toHaveBeenCalledTimes(1);
    api.speakNavigation("Turn left in 200 metres.", { repeat: true });
    await settle();
    expect(speech.speak).toHaveBeenCalledTimes(2);
  });

  it("recovers a removed enhanced voice once using the OS English default", async () => {
    const api = await import("../src/services/navigation-voice");
    api.speakNavigation("Continue onto Garden Road.");
    await settle();
    speech.speak.mock.calls[0]![1].onError(new Error("Voice removed"));
    await settle();
    expect(speech.speak).toHaveBeenCalledTimes(2);
    expect(speech.speak.mock.calls[1]![1]).toMatchObject({
      language: "en-US",
      rate: 1,
      pitch: 1,
    });
    expect(speech.speak.mock.calls[1]![1].voice).toBeUndefined();
    expect(speech.speak.mock.calls[1]![1].onError).toBeUndefined();
  });

  it("an interrupted old voice failure cannot bring back an obsolete turn", async () => {
    const api = await import("../src/services/navigation-voice");
    api.speakNavigation("Turn left.");
    await settle();
    const oldError = speech.speak.mock.calls[0]![1].onError;
    api.speakNavigation("You have arrived.");
    oldError(new Error("interrupted"));
    await settle();
    expect(speech.speak.mock.calls.map(([text]) => text)).toEqual([
      "Turn left.",
      "You have arrived.",
    ]);
  });
});
