import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { apiFetch } from "../src/security/transport";
import {
  emailInput,
  passwordInput,
  profileInput,
  textInput,
  numeric,
} from "../src/security/validation";
import { failure } from "../src/security/errors";
import { diagnostic } from "../src/security/diagnostics";
import { defaultProfile } from "../src/services/seed";
const { pinConfiguration, androidNetworkXml } = createRequire(import.meta.url)(
  "../plugins/with-native-security.js",
);

describe("untrusted input", () => {
  it("keeps gender sharing opt-in and clears consent when the category is removed", () => {
    const original = defaultProfile("u");
    expect(profileInput(original)).toMatchObject({
      leaderboardGender: null,
      shareLeaderboardGender: false,
    });
    expect(
      profileInput({ ...original, leaderboardGender: "nonbinary" }),
    ).toMatchObject({ shareLeaderboardGender: false });
    expect(
      profileInput({
        ...original,
        leaderboardGender: "women",
        shareLeaderboardGender: true,
      }),
    ).toMatchObject({ shareLeaderboardGender: true });
    expect(
      profileInput({
        ...original,
        leaderboardGender: null,
        shareLeaderboardGender: true,
      }),
    ).toMatchObject({ shareLeaderboardGender: false });
    expect(() =>
      profileInput({ ...original, leaderboardGender: "inferred" as never }),
    ).toThrow("gender");
  });
  it("rejects unsafe personal HR boundaries and detaches saved settings from caller mutation", () => {
    const original = defaultProfile("u");
    for (const boundaries of [
      [100, 100, 150, 170],
      [100, 120, 150, 241],
      [100, 120.5, 150, 170],
      [100, 120, 150],
    ])
      expect(() =>
        profileInput({ ...original, hrZoneThresholds: boundaries as never }),
      ).toThrow("boundaries");
    const thresholds: [number, number, number, number] = [100, 120, 150, 170];
    const saved = profileInput({ ...original, hrZoneThresholds: thresholds });
    thresholds[0] = 80;
    expect(saved.hrZoneThresholds).toEqual([100, 120, 150, 170]);
    expect(() =>
      profileInput({
        ...original,
        maxHR: 160,
        hrZoneThresholds: [100, 120, 150, 170],
      }),
    ).toThrow("boundaries");
  });
  it("normalizes display text without escaping literal athlete text", () => {
    expect(textInput("  Jose\u0301 <fast>\r\nrunner  ", "Name", 100)).toBe(
      "José <fast>\nrunner",
    );
    expect(() => textInput("safe\u202Etxt", "Name", 100)).toThrow("control");
    expect(() => textInput("\u0000", "Name", 100)).toThrow("control");
    expect(textInput("🏃🏃", "Name", 2)).toBe("🏃🏃");
    expect(() => textInput("🏃🏃🏃", "Name", 2)).toThrow("1–2");
  });
  it("preserves password bytes and email local-part case", () => {
    expect(emailInput("  Athlete@EXAMPLE.COM  ")).toBe("Athlete@example.com");
    expect(passwordInput("  1234567890  ", true)).toBe("  1234567890  ");
    expect(passwordInput("older-pass", false)).toBe("older-pass");
    expect(() => passwordInput("older-pass", true)).toThrow("12–128");
  });
  it("rejects nonfinite health values and out-of-range privacy coordinates", () => {
    expect(() => numeric(NaN, "HR", 30, 240)).toThrow();
    expect(() => numeric(Infinity, "HR", 30, 240)).toThrow();
    expect(() =>
      profileInput({
        ...defaultProfile("u"),
        privacyZones: [
          {
            id: "12345678-1234-1234-1234-123456789012",
            label: "Home",
            lat: 100,
            lng: 0,
            radius: 200,
          },
        ],
      }),
    ).toThrow("Latitude");
    expect(() =>
      profileInput({ ...defaultProfile("u"), handle: "../../secrets" }),
    ).toThrow("letters");
  });
});
describe("transport boundaries", () => {
  it("blocks insecure configuration and cross-origin credentials before fetch", async () => {
    const transport = vi.fn<typeof fetch>();
    expect(() => apiFetch("http://api.example.test", transport)).toThrow(
      "HTTPS",
    );
    const request = apiFetch("https://api.example.test", transport);
    await expect(
      request("https://other.example.test", {
        headers: { Authorization: "secret" },
      }),
    ).rejects.toMatchObject({ kind: "forbidden" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("does not retry mutations and asks the transport to reject redirects", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 503 }));
    const response = await apiFetch("https://api.example.test", transport)(
      "https://api.example.test/rest",
      { method: "POST", body: "workout" },
    );
    expect(response.status).toBe(503);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
    });
  });
  it("times out stalled requests and removes caller listeners", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(
          (_url, init) =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("Aborted", "AbortError")),
              ),
            ),
        );
      const pending = apiFetch(
        "https://api.example.test",
        transport,
        100,
      )("https://api.example.test/rest", { signal: controller.signal });
      const assertion = expect(pending).rejects.toMatchObject({
        kind: "timeout",
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("never sends an already cancelled request", async () => {
    const transport = vi.fn<typeof fetch>();
    const controller = new AbortController();
    controller.abort();
    await expect(
      apiFetch("https://api.example.test", transport)(
        "https://api.example.test/rest",
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(transport).not.toHaveBeenCalled();
  });
});
it("never exposes untrusted error bodies or context in diagnostics", () => {
  const raw = new Error(
    "https://private.test?token=secret, home=28.1,77.2, password=hunter2",
  );
  const result = diagnostic(raw, {
    service: raw.message,
    email: "athlete@example.test",
  });
  expect(result.error.message).toBe("RIVL unknown failure");
  expect(result.tags).toEqual({ kind: "unknown", service: "application" });
  expect(failure(raw).message).not.toContain("secret");
  expect(failure({ status: 429 }).retryable).toBe(true);
});
describe("native TLS policy", () => {
  const first = Buffer.alloc(32, 1).toString("base64"),
    second = Buffer.alloc(32, 2).toString("base64");
  it("requires independent, well-formed backup pins", () => {
    expect(() => pinConfiguration("api.example.test", first)).toThrow(
      "two distinct",
    );
    expect(() =>
      pinConfiguration("api.example.test", `${first},${first}`),
    ).toThrow("two distinct");
    expect(() =>
      pinConfiguration("api.example.test/evil", `${first},${second}`),
    ).toThrow("hostname");
    expect(() =>
      pinConfiguration("api.example.test", `${first},not-a-pin`),
    ).toThrow();
  });
  it("restricts release trust while isolating Metro cleartext to debug", () => {
    const pins = pinConfiguration("api.example.test", `${first},${second}`);
    const release = androidNetworkXml(pins),
      debug = androidNetworkXml(pins, true);
    expect(release).toContain('base-config cleartextTrafficPermitted="false"');
    expect(release).not.toContain('src="user"');
    expect(release).not.toContain("expiration=");
    expect(debug).toContain('base-config cleartextTrafficPermitted="true"');
    expect(debug).toContain('domain-config cleartextTrafficPermitted="false"');
  });
});
