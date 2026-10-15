import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiJson } from "../src/security/transport";

const url = "https://routing.example/routes";
function nativeResponse(
  text: () => Promise<string>,
  headers = new Headers(),
): Response {
  return { ok: true, status: 200, url, headers, body: null, text } as Response;
}
afterEach(() => vi.useRealTimers());

describe("bounded JSON transport", () => {
  it("times out stalled native bodies even when transport ignores abort", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(async () =>
      nativeResponse(() => new Promise(() => {})),
    );
    const request = apiJson(url, url, undefined, { transport, timeoutMs: 30 });
    const rejected = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(30);
    await rejected;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels after headers arrive and removes the caller listener", async () => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    let bodyStarted!: () => void;
    const ready = new Promise<void>((resolve) => {
      bodyStarted = resolve;
    });
    const transport = vi.fn<typeof fetch>(async () =>
      nativeResponse(() => {
        bodyStarted();
        return new Promise(() => {});
      }),
    );
    const request = apiJson(url, url, { signal: caller.signal }, { transport });
    const rejected = expect(request).rejects.toMatchObject({
      kind: "cancelled",
    });
    await ready;
    caller.abort();
    await rejected;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("bounds streaming bodies and cancels stalled readers", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const transport = vi.fn<typeof fetch>(
      async () => new Response(new ReadableStream({ cancel })),
    );
    const request = apiJson(url, url, undefined, { transport, timeoutMs: 25 });
    const rejected = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects excessive declared lengths before reading native bodies", async () => {
    const text = vi.fn(async () => "{}");
    const transport = vi.fn<typeof fetch>(async () =>
      nativeResponse(text, new Headers({ "content-length": "100" })),
    );
    await expect(
      apiJson(url, url, undefined, { transport, maxBytes: 10 }),
    ).rejects.toThrow("too large");
    expect(text).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes in native bodies and streamed chunks", async () => {
    const text = '"🏃"';
    const native = vi.fn<typeof fetch>(async () =>
      nativeResponse(async () => text),
    );
    await expect(
      apiJson(url, url, undefined, { transport: native, maxBytes: 5 }),
    ).rejects.toThrow("too large");
    const streamed = vi.fn<typeof fetch>(async () => new Response(text));
    await expect(
      apiJson(url, url, undefined, { transport: streamed, maxBytes: 5 }),
    ).rejects.toThrow("too large");
    await expect(
      apiJson(url, url, undefined, { transport: native, maxBytes: 6 }),
    ).resolves.toBe("🏃");
  });

  it("gives readable malformed JSON errors without exposing response bodies", async () => {
    const transport = vi.fn<typeof fetch>(
      async () => new Response("secret-provider-body"),
    );
    await expect(
      apiJson(url, url, undefined, { transport }),
    ).rejects.toMatchObject({
      kind: "server",
      message: "The service sent an unreadable response. Try again.",
    });
  });

  it("validates HTTPS origins and rejects cancellation before requesting", async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      apiJson("http://routing.example", "http://routing.example", undefined, {
        transport,
      }),
    ).rejects.toThrow("HTTPS");
    await expect(
      apiJson(url, "https://other.example", undefined, { transport }),
    ).rejects.toThrow("destination");
    const caller = new AbortController();
    caller.abort();
    await expect(
      apiJson(url, url, { signal: caller.signal }, { transport }),
    ).rejects.toMatchObject({ kind: "cancelled" });
    expect(transport).not.toHaveBeenCalled();
  });

  it("times out before headers if the transport ignores abort", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const request = apiJson(url, url, undefined, { transport, timeoutMs: 20 });
    const rejected = expect(request).rejects.toMatchObject({ kind: "timeout" });
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("backend fetch deadlines", () => {
  it("settles even when the fetch implementation ignores abort", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending = apiFetch(url, transport, 30)(url);
    const assertion = expect(pending).rejects.toMatchObject({
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(transport.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the original deadline through a stalled native JSON body", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(
      async () =>
        ({
          ...nativeResponse(() => new Promise(() => {})),
          json: () => new Promise(() => {}),
        }) as Response,
    );
    const response = await apiFetch(url, transport, 30)(url);
    await vi.advanceTimersByTimeAsync(20);
    const assertion = expect(response.json()).rejects.toMatchObject({
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors caller cancellation after headers, including ignored native abort", async () => {
    const caller = new AbortController();
    const remove = vi.spyOn(caller.signal, "removeEventListener");
    const transport = vi.fn<typeof fetch>(async () =>
      nativeResponse(() => new Promise(() => {})),
    );
    const response = await apiFetch(url, transport)(url, {
      signal: caller.signal,
    });
    const assertion = expect(response.text()).rejects.toMatchObject({
      kind: "cancelled",
    });
    caller.abort();
    await assertion;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("preserves Response metadata, clones, HTTP errors and binary consumers", async () => {
    vi.useFakeTimers();
    const transport = vi.fn<typeof fetch>(
      async () =>
        new Response("failure", {
          status: 429,
          headers: { "x-request-id": "test-id" },
        }),
    );
    const response = await apiFetch(url, transport)(url);
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(429);
    expect(response.headers.get("x-request-id")).toBe("test-id");
    const clone = response.clone();
    expect(await response.text()).toBe("failure");
    expect(new TextDecoder().decode(await clone.arrayBuffer())).toBe("failure");
    expect(response.bodyUsed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a stalled clone bounded after another body finishes", async () => {
    vi.useFakeTimers();
    const stalled = nativeResponse(() => new Promise(() => {}));
    const original = new Response("done");
    original.clone = () => stalled;
    const response = await apiFetch(url, async () => original, 30)(url);
    const clone = response.clone();
    expect(await response.text()).toBe("done");
    const assertion = expect(clone.text()).rejects.toMatchObject({
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
