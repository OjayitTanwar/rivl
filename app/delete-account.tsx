import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useStore } from "../src/state/store";
import { Screen, Txt, Stack, Field, Button, Notice } from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
export default function DeleteAccount() {
  const {
    session,
    activities,
    deleteAccount,
    requestDeletionCode,
    deleteAccountWithCode,
    deletionNeedsPassword,
  } = useStore();
  const [method, setMethod] = useState<"password" | "code" | null>(null);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<"completed" | "requested" | null>(null);
  useEffect(() => {
    if (method !== null || !session) return;
    if (session.local) {
      setMethod("password");
      return;
    }
    let active = true;
    deletionNeedsPassword()
      .then((available) => {
        if (active) setMethod(available ? "password" : "code");
      })
      .catch((problem) => {
        if (active) setError(userMessage(problem));
      });
    return () => {
      active = false;
    };
  }, [method, session, deletionNeedsPassword]);
  async function remove() {
    setBusy(true);
    setError("");
    try {
      setResult(await deleteAccount(password));
      setPassword("");
    } catch (problem) {
      setError(userMessage(problem));
    } finally {
      setBusy(false);
    }
  }
  async function requestCode() {
    setBusy(true);
    setError("");
    try {
      await requestDeletionCode();
      setCodeSent(true);
    } catch (problem) {
      setError(userMessage(problem));
    } finally {
      setBusy(false);
    }
  }
  async function removeWithCode() {
    setBusy(true);
    setError("");
    try {
      setResult(await deleteAccountWithCode(code.trim()));
      setCode("");
    } catch (problem) {
      setError(userMessage(problem));
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <Screen title={result === "completed" ? "Account deleted" : "Deletion requested"}>
        <Txt>
          {result === "completed"
            ? "Your account and its data have been deleted."
            : "Your cloud account is locked for deletion. Cleanup will continue automatically. Data on this device has been removed."}
        </Txt>
        <Button title="Return to sign in" onPress={() => router.replace("/auth")} />
      </Screen>
    );
  function confirm(text: string, action: () => void) {
    Alert.alert(
      "Permanently delete your account?",
      "Your saved workouts, photos and social content will be removed.",
      [
        { text: "Keep account", style: "cancel" },
        { text: "Delete account", style: "destructive", onPress: action },
      ],
    );
  }
  return (
    <Screen title="Delete your account" back>
      <Stack gap={20}>
        <Txt>
          This permanently removes your profile, workouts, routes, health cache,
          photos, comments and reactions. This action cannot be undone.
        </Txt>
        {activities.some((a) => a.sync !== "synced") && (
          <Notice text="You have workouts stored only on this device. They will also be deleted." />
        )}
        {session?.local ? (
          <Notice text="This is a local development account. Deletion removes its data from this device." />
        ) : method === "password" ? (
          <Field
            label="Current password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            maxLength={128}
          />
        ) : codeSent ? (
          <>
            <Txt>
              Enter the code we emailed to {session?.email || "your address"}. It
              expires shortly.
            </Txt>
            <Field
              label="Code from the email"
              testID="delete-code"
              value={code}
              onChangeText={(next) =>
                setCode(next.replace(/\D/g, "").slice(0, 10))
              }
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              maxLength={10}
              onSubmitEditing={() => confirm("", () => void removeWithCode())}
            />
            <Button
              testID="delete-resend"
              title="Email me a code again"
              variant="secondary"
              loading={busy}
              disabled={!session}
              onPress={() => void requestCode()}
            />
          </>
        ) : (
          <>
            <Txt>
              This account signs in through Apple or Google, so reconfirm with a
              code emailed to {session?.email || "your address"}.
            </Txt>
            <Button
              testID="delete-send-code"
              title="Email me a code"
              variant="secondary"
              loading={busy}
              disabled={!session}
              onPress={() => void requestCode()}
            />
          </>
        )}
        {!!error && <Notice text={error} />}
        <Button
          title="Delete account and data"
          variant="danger"
          loading={busy}
          disabled={
            !session ||
            (method === "password" && !password) ||
            (method === "code" && (!codeSent || code.trim().length < 6))
          }
          onPress={() =>
            confirm(
              "",
              () =>
                void (method === "code" ? removeWithCode() : remove()),
            )
          }
        />
      </Stack>
    </Screen>
  );
}
