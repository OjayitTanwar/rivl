import { AppFailure } from "./errors";

export interface ApiJsonOptions {
  transport?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  checkResponse?: (response: Response) => void;
}

// Count UTF-8 bytes without relying on TextEncoder being present in native runtimes.
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Keep cancellation and a deadline active until the JSON body has been read. */
export async function apiJson(
  baseUrl: string,
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
  options: ApiJsonOptions = {},
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 25_000;
  const maxBytes = options.maxBytes ?? 4_000_000;
  if (
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes <= 0
  )
    throw new AppFailure("validation", "The request limits are invalid.");
  const base = checkedBase(baseUrl);
  checkDestination(base, input);
  const transport = options.transport ?? fetch;
  const controller = new AbortController();
  const source =
    init?.signal ??
    (typeof Request !== "undefined" && input instanceof Request
      ? input.signal
      : null);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let stopped: AppFailure | undefined;
  let rejectStopped!: (error: AppFailure) => void;
  const interruption = new Promise<never>((_, reject) => {
    rejectStopped = reject;
  });
  const stop = (error: AppFailure) => {
    if (stopped) return;
    stopped = error;
    rejectStopped(error);
    controller.abort();
    // Native transports and test doubles may ignore abort; never wait for cancel.
    if (reader) void reader.cancel().catch(() => {});
  };
  const cancel = () =>
    stop(new AppFailure("cancelled", "The request was cancelled."));
  const timer = setTimeout(
    () =>
      stop(
        new AppFailure(
          "timeout",
          "The connection timed out. Retry when you have a stable connection.",
          true,
        ),
      ),
    timeoutMs,
  );
  if (source?.aborted) cancel();
  else source?.addEventListener("abort", cancel, { once: true });
  const tooLarge = () =>
    new AppFailure(
      "server",
      "The service response is too large. Try a smaller request.",
    );
  const operation = async () => {
    if (stopped) throw stopped;
    const response = await transport(input, {
      ...init,
      signal: controller.signal,
      redirect: "error",
    });
    if (stopped) throw stopped;
    if (response.url) checkDestination(base, response.url);
    if (options.checkResponse) options.checkResponse(response);
    else if (!response.ok)
      throw new AppFailure(
        response.status === 429 ? "rate_limit" : "server",
        "The service is unavailable. Try again shortly.",
        true,
      );
    if (Number(response.headers.get("content-length") ?? 0) > maxBytes)
      throw tooLarge();
    let body: string;
    if (response.body?.getReader && typeof TextDecoder !== "undefined") {
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parts: string[] = [];
      let bytes = 0;
      while (true) {
        if (stopped) throw stopped;
        const { done, value } = await reader.read();
        if (stopped) throw stopped;
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw tooLarge();
        parts.push(decoder.decode(value, { stream: true }));
      }
      reader.releaseLock();
      parts.push(decoder.decode());
      body = parts.join("");
    } else {
      body = await response.text();
      if (stopped) throw stopped;
      if (utf8Bytes(body) > maxBytes) throw tooLarge();
    }
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new AppFailure(
        "server",
        "The service sent an unreadable response. Try again.",
        true,
      );
    }
  };
  try {
    return await Promise.race([operation(), interruption]);
  } catch (error) {
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
    if (stopped) throw stopped;
    if (error instanceof AppFailure) throw error;
    throw new AppFailure(
      "server",
      "The service response could not be read. Try again.",
      true,
    );
  } finally {
    clearTimeout(timer);
    source?.removeEventListener("abort", cancel);
  }
}
function checkedBase(baseUrl: string): URL {
  const base = new URL(baseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new AppFailure(
      "validation",
      "The API must use an HTTPS URL without embedded credentials.",
    );
  return base;
}
function checkDestination(base: URL, input: Parameters<typeof fetch>[0]): void {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  if (url.origin !== base.origin || url.username || url.password)
    throw new AppFailure(
      "forbidden",
      "The request destination is not allowed.",
    );
}
export function apiFetch(
  baseUrl: string,
  transport: typeof fetch = fetch,
  timeoutMs = 25000,
): typeof fetch {
  const base = checkedBase(baseUrl);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new AppFailure("validation", "The request limits are invalid.");
  return async (input, init) => {
    checkDestination(base, input);
    const controller = new AbortController();
    const source =
      init?.signal ??
      (typeof Request !== "undefined" && input instanceof Request
        ? input.signal
        : null);
    let stopped: AppFailure | undefined;
    let rejectStopped!: (error: AppFailure) => void;
    const interruption = new Promise<never>((_, reject) => {
      rejectStopped = reject;
    });
    // A response can be discarded without reading its body. Still observe a later
    // deadline rejection, while retaining it for a subsequent body consumer.
    void interruption.catch(() => {});
    const cleanup = () => {
      clearTimeout(timer);
      source?.removeEventListener("abort", cancel);
    };
    const stop = (error: AppFailure) => {
      if (stopped) return;
      stopped = error;
      rejectStopped(error);
      controller.abort();
      cleanup();
    };
    const cancel = () =>
      stop(new AppFailure("cancelled", "The request was cancelled."));
    const timer = setTimeout(
      () =>
        stop(
          new AppFailure(
            "timeout",
            "The connection timed out. Retry when you have a stable connection.",
            true,
          ),
        ),
      timeoutMs,
    );
    if (source?.aborted) cancel();
    else source?.addEventListener("abort", cancel, { once: true });
    const guarded = async <T>(operation: () => Promise<T>): Promise<T> => {
      if (stopped) throw stopped;
      try {
        return await Promise.race([operation(), interruption]);
      } catch (error) {
        if (stopped) throw stopped;
        throw error;
      }
    };
    // Keep the actual native Response, including headers, status and URL. Bind
    // native methods to their original receiver rather than rebuilding a response
    // (which can change binary bodies and empty-response semantics on iOS).
    let unreadResponses = 0;
    const wrap = (response: Response): Response => {
      unreadResponses += 1;
      let finished = false;
      return new Proxy(response, {
        get(target, property) {
          const value = Reflect.get(target, property, target);
          if (property === "clone") return () => wrap(target.clone());
          if (typeof value !== "function") return value;
          if (
            [
              "json",
              "text",
              "arrayBuffer",
              "blob",
              "formData",
              "bytes",
            ].includes(String(property))
          )
            return async (...args: unknown[]) => {
              try {
                return await guarded(() => value.apply(target, args));
              } finally {
                if (!finished) {
                  finished = true;
                  unreadResponses -= 1;
                  if (unreadResponses === 0) cleanup();
                }
              }
            };
          return value.bind(target);
        },
      });
    };
    try {
      const response = await guarded(() =>
        transport(input, {
          ...init,
          signal: controller.signal,
          redirect: "error",
        }),
      );
      if (response.url) checkDestination(base, response.url);
      return wrap(response);
    } catch (error) {
      cleanup();
      controller.abort();
      throw error;
    }
  };
}
