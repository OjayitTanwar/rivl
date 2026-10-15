import React, { useState } from "react";
import { router } from "expo-router";
import { useStore } from "../src/state/store";
import { Screen, Txt, Stack, Field, Button, Notice } from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
export default function ForgotPassword() {
  const { beginPasswordRecovery } = useStore();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function request() {
    setBusy(true);
    setError("");
    try {
      await beginPasswordRecovery(email.trim());
      setSent(true);
    } catch (problem) {
      setError(userMessage(problem));
    } finally {
      setBusy(false);
    }
  }
  if (sent)
    return (
      <Screen title="Check your email" back>
        <Stack gap={20}>
          <Txt>
            If that email belongs to an account, a password-reset link is on its
            way. Open it on this device to choose a new password.
          </Txt>
          <Button title="Back to sign in" onPress={() => router.replace("/auth")} />
        </Stack>
      </Screen>
    );
  return (
    <Screen title="Reset your password" back>
      <Stack gap={20}>
        <Txt>
          Enter the email on your account and we will send a link to choose a
          new password.
        </Txt>
        <Field
          label="Email"
          testID="recovery-email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
          onSubmitEditing={() => void request()}
        />
        {!!error && <Notice text={error} />}
        <Button
          testID="recovery-submit"
          title="Send reset link"
          loading={busy}
          onPress={() => void request()}
        />
      </Stack>
    </Screen>
  );
}
