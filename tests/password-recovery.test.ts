import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock("../src/services/supabase", () => ({
  supabase: { auth },
  configurationError: null,
}));
import {
  beginPasswordRecovery,
  finishPasswordRecovery,
} from "../src/services/password-recovery";
beforeEach(() => {
  vi.clearAllMocks();
  auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  auth.exchangeCodeForSession.mockResolvedValue({
    data: { user: { id: "a", email: "Runner@Example.com" } },
    error: null,
  });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
});
it("sends the reset email to a normalized address for the app deep link", async () => {
  await beginPasswordRecovery(" Runner@Example.com ");
  expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
    "Runner@example.com",
    { redirectTo: "rivl://password-reset" },
  );
});
it("surfaces a rate-limited or failed email request", async () => {
  auth.resetPasswordForEmail.mockResolvedValue({
    data: {},
    error: { message: "email rate limit exceeded" },
  });
  await expect(beginPasswordRecovery("runner@example.com")).rejects.toThrow(
    "email rate limit exceeded",
  );
});
it("exchanges the recovery code before offering to save the password", async () => {
  const user = await finishPasswordRecovery("recovery-code", "braveriver12");
  expect(user.id).toBe("a");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
  expect(auth.updateUser).toHaveBeenCalledWith({ password: "braveriver12" });
  expect(
    auth.updateUser.mock.invocationCallOrder[0]!,
  ).toBeGreaterThan(auth.exchangeCodeForSession.mock.invocationCallOrder[0]!);
});
it("rejects an incomplete recovery link without touching the session", async () => {
  await expect(finishPasswordRecovery("", "braveriver12")).rejects.toThrow(
    "incomplete",
  );
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});
it("rejects an expired recovery link", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({
    data: {},
    error: { message: "invalid link" },
  });
  await expect(finishPasswordRecovery("old-code", "braveriver12")).rejects.toThrow(
    "invalid link",
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("keeps requesting a fresh password if the exchange returned no user", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
  await expect(finishPasswordRecovery("empty-code", "braveriver12")).rejects.toThrow(
    "expired",
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
});
it("does not treat a failed password save as success", async () => {
  auth.updateUser.mockResolvedValue({
    data: {},
    error: { message: "password too weak" },
  });
  await expect(
    finishPasswordRecovery("good-code", "braveriver12"),
  ).rejects.toThrow("password too weak");
});
it("rejects a password below the signup minimum", async () => {
  await expect(finishPasswordRecovery("good-code", "short")).rejects.toThrow(
    "12–128",
  );
  expect(auth.updateUser).not.toHaveBeenCalled();
});
