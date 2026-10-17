import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ resend: vi.fn() }));
vi.mock("../src/services/supabase", () => ({
  supabase: { auth: { resend: mock.resend } },
}));
import { resendSignupConfirmation } from "../src/services/signup-confirmation";
import { failure } from "../src/security/errors";
beforeEach(() => mock.resend.mockReset().mockResolvedValue({ error: null }));
describe("signup confirmation recovery", () => {
  it("requests a signup link for the normalized address and native callback", async () => {
    await resendSignupConfirmation("runner@EXAMPLE.TEST");
    expect(mock.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "runner@example.test",
      options: { emailRedirectTo: "rivl://auth-callback" },
    });
  });
  it("rejects invalid email without sending a request", async () => {
    await expect(resendSignupConfirmation("not an email")).rejects.toThrow(
      "valid email",
    );
    expect(mock.resend).not.toHaveBeenCalled();
  });
  it("preserves email delivery failures instead of reporting success", async () => {
    const error = { code: "over_email_send_rate_limit", status: 429 };
    mock.resend.mockResolvedValue({ error });
    await expect(
      resendSignupConfirmation("runner@example.test"),
    ).rejects.toEqual(error);
    expect(failure(error).message).toContain("Confirmation email");
  });
  it("explains unconfirmed sign-in and sender restrictions", () => {
    expect(
      failure({ code: "email_not_confirmed", status: 400 }).message,
    ).toContain("Confirm your email");
    expect(
      failure({ code: "email_address_not_authorized", status: 403 }).message,
    ).toContain("email service");
    expect(
      failure({ code: "invalid_credentials", status: 400 }).message,
    ).toContain("didn’t match");
  });
});
