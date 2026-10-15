import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getSession: vi.fn(),
}));
const state = vi.hoisted(() => ({
  row: null as { state: string } | null,
  rowError: null as unknown,
  invoke: null as unknown,
}));
const from = vi.hoisted(() => {
  const maybeSingle = vi.fn(async () => ({
    data: state.row,
    error: state.rowError,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const table = vi.fn(() => ({ select }));
  return { maybeSingle, eq, select, table };
});
const invoke = vi.hoisted(() =>
  vi.fn<() => Promise<{
    data: { accepted: boolean; state: string } | null;
    error: { message: string } | null;
  }>>(async () => ({
    data: { accepted: true, state: "requested" },
    error: null,
  })),
);
vi.mock("../src/services/supabase", () => ({
  supabase: { auth, from: from.table, functions: { invoke } },
  configurationError: null,
}));
import {
  passwordDeletionAvailable,
  sendDeletionCode,
  requestDeletionWithCode,
  requestDeletion,
} from "../src/services/account-deletion";
const session = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "runner@example.test",
  demo: false,
  local: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.row = null;
  state.rowError = null;
  auth.signInWithOtp.mockResolvedValue({ data: {}, error: null });
  auth.signInWithPassword.mockResolvedValue({
    data: { user: { id: session.userId } },
    error: null,
  });
  auth.verifyOtp.mockResolvedValue({
    data: { user: { id: session.userId } },
    error: null,
  });
  auth.getSession.mockResolvedValue({
    data: {
      session: { user: { identities: [{ provider: "email" }] } },
    },
    error: null,
  });
});
it("offers password reauthentication only when the account has a password identity", async () => {
  expect(await passwordDeletionAvailable(session)).toBe(true);
  auth.getSession.mockResolvedValueOnce({
    data: {
      session: {
        user: { identities: [{ provider: "google" }, { provider: "apple" }] },
      },
    },
    error: null,
  });
  expect(await passwordDeletionAvailable(session)).toBe(false);
  auth.getSession.mockResolvedValueOnce({
    data: { session: { user: {} } },
    error: null,
  });
  expect(await passwordDeletionAvailable(session)).toBe(true);
});
it("emails a one-time code without creating a new account", async () => {
  await sendDeletionCode(session);
  expect(auth.signInWithOtp).toHaveBeenCalledWith({
    email: session.email,
    options: { shouldCreateUser: false },
  });
});
it("does not email a code when deletion is already requested", async () => {
  state.row = { state: "requested" };
  await sendDeletionCode(session);
  expect(auth.signInWithOtp).not.toHaveBeenCalled();
});
it("rejects a code outside the configured length range before contacting the server", async () => {
  await expect(requestDeletionWithCode(session, "12345")).rejects.toThrow(
    "code from the email",
  );
  await expect(requestDeletionWithCode(session, "12345678901")).rejects.toThrow(
    "code from the email",
  );
  await expect(requestDeletionWithCode(session, "13524a")).rejects.toThrow(
    "code from the email",
  );
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
it("accepts the hosted 8-digit OTP length instead of assuming six digits", async () => {
  expect(await requestDeletionWithCode(session, "13572468")).toBe("requested");
  expect(auth.verifyOtp).toHaveBeenCalledWith({
    email: session.email,
    token: "13572468",
    type: "email",
  });
});
it("verifies the emailed code and then submits the deletion", async () => {
  expect(await requestDeletionWithCode(session, "135246")).toBe("requested");
  expect(auth.verifyOtp).toHaveBeenCalledWith({
    email: session.email,
    token: "135246",
    type: "email",
  });
  expect(invoke).toHaveBeenCalledWith("delete-account", { body: {} });
});
it("refuses a verified code that belongs to another athlete", async () => {
  auth.verifyOtp.mockResolvedValue({
    data: { user: { id: "22222222-2222-4222-8222-222222222222" } },
    error: null,
  });
  await expect(requestDeletionWithCode(session, "135246")).rejects.toThrow(
    "Confirm the account",
  );
  expect(invoke).not.toHaveBeenCalled();
});
it("keeps an existing deletion request without another verification", async () => {
  state.row = { state: "completed" };
  expect(await requestDeletionWithCode(session, "135246")).toBe("completed");
  expect(auth.verifyOtp).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});
it("does not submit deletion when the server rejects the code", async () => {
  auth.verifyOtp.mockResolvedValue({
    data: {},
    error: { message: "invalid otp" },
  });
  await expect(requestDeletionWithCode(session, "999999")).rejects.toThrow(
    "invalid otp",
  );
  expect(invoke).not.toHaveBeenCalled();
});
it("reports the recorded state when submission fails but the server kept the request", async () => {
  invoke.mockResolvedValueOnce({ data: null, error: { message: "edge down" } });
  from.maybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: { state: "completed" }, error: null });
  expect(await requestDeletionWithCode(session, "135246")).toBe("completed");
});
it("throws when submission fails and nothing was recorded", async () => {
  invoke.mockResolvedValueOnce({ data: null, error: { message: "edge down" } });
  await expect(requestDeletionWithCode(session, "135246")).rejects.toThrow(
    "Deletion could not be confirmed",
  );
});
it("still reauthenticates with a password for password accounts", async () => {
  expect(await requestDeletion(session, "current-password")).toBe("requested");
  expect(auth.signInWithPassword).toHaveBeenCalledWith({
    email: session.email,
    password: "current-password",
  });
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("reports an already-requested deletion without asking for the password again", async () => {
  state.row = { state: "requested" };
  expect(await requestDeletion(session, "wrong")).toBe("requested");
  expect(auth.signInWithPassword).not.toHaveBeenCalled();
});
