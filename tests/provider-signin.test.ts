import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getSession: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));
vi.mock("../src/services/supabase", () => ({ supabase: { auth } }));
import { finishProviderSignIn } from "../src/services/provider-signin";
beforeEach(() => {
  vi.clearAllMocks();
  auth.exchangeCodeForSession.mockResolvedValue({
    data: { user: { id: "a" } },
    error: null,
  });
  auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "a" } } },
    error: null,
  });
});
it("deduplicates browser and deep-link code exchanges while the same account is signed in", async () => {
  const users = await Promise.all([
    finishProviderSignIn("duplicate-code"),
    finishProviderSignIn("duplicate-code"),
  ]);
  expect(users.map((user) => user.id)).toEqual(["a", "a"]);
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
});
it("does not reuse a completed sign-in link after logout", async () => {
  await finishProviderSignIn("logout-code");
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(finishProviderSignIn("logout-code")).rejects.toThrow("expired");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
});
it("does not reuse a completed link for another signed-in account", async () => {
  await finishProviderSignIn("changed-account-code");
  auth.getSession.mockResolvedValue({
    data: { session: { user: { id: "b" } } },
    error: null,
  });
  await expect(finishProviderSignIn("changed-account-code")).rejects.toThrow(
    "expired",
  );
});
it("rejects an exchange that returns a user without an active session", async () => {
  auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  await expect(finishProviderSignIn("no-session-code")).rejects.toThrow(
    "expired",
  );
});
it("allows a fresh retry after a failed exchange without keeping its failed promise", async () => {
  auth.exchangeCodeForSession.mockResolvedValueOnce({
    data: {},
    error: new Error("temporarily unavailable"),
  });
  await expect(finishProviderSignIn("retry-code")).rejects.toThrow(
    "temporarily unavailable",
  );
  await expect(finishProviderSignIn("retry-code")).resolves.toMatchObject({
    id: "a",
  });
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(2);
});
