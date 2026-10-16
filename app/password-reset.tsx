import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  Field,
  Button,
  Notice,
} from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
export default function PasswordReset() {
  const { code, error: linkError } = useLocalSearchParams<{
    code?: string;
    error?: string;
  }>();
  const { completePasswordRecovery } = useStore();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const broken = linkError || !code;
  async function save() {
    if (password !== confirm) {
      setError("The passwords do not match. Try again.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await completePasswordRecovery(
        Array.isArray(code) ? code[0] : code!,
        password,
      );
      router.replace("/");
    } catch (problem) {
      setError(userMessage(problem));
    } finally {
      setBusy(false);
    }
  }
  if (broken)
    return (
      <Screen title="Link expired" back>
        <Stack gap={24}>
          <Txt>
            This password-reset link is incomplete or has expired. Request a
            fresh email to continue.
          </Txt>
          <Button
            title="Request a new link"
            onPress={() => router.replace("/forgot-password")}
          />
        </Stack>
      </Screen>
    );
  return (
    <Screen title="Choose a new password" back>
      <Stack gap={24}>
        <Txt>
          Use 12–128 characters. After saving, you stay signed in on this
          device.
        </Txt>
        <Field
          label="New password"
          testID="reset-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!busy}
          maxLength={128}
          autoComplete="new-password"
        />
        <Field
          label="New password, again"
          testID="reset-password-confirm"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          editable={!busy}
          maxLength={128}
          autoComplete="new-password"
          onSubmitEditing={() => void save()}
        />
        {!!error && <Notice text={error} />}
        <Button
          testID="reset-submit"
          title="Save new password"
          loading={busy}
          disabled={!password || !confirm}
          onPress={() => void save()}
        />
      </Stack>
    </Screen>
  );
}
