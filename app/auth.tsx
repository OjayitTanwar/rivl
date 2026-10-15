import { AppFailure, userMessage } from "../src/security/errors";
import React, { useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { router, Redirect } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import { useStore } from "../src/state/store";
import {
  Screen,
  Txt,
  Stack,
  Row,
  Button,
  Field,
  Notice,
  Segmented,
} from "../src/ui/primitives";
import { brand, useTheme } from "../src/ui/theme";
import { backendConfigured, config } from "../src/services/config";
import { RivlLogo } from "../src/ui/RivlLogo";
export default function Auth() {
  const { session, authenticate, authenticateProvider } = useStore(),
    { c } = useTheme(),
    { width } = useWindowDimensions(),
    [mode, setMode] = useState<"signup" | "signin">("signup"),
    [accountMode, setAccountMode] = useState<"device" | "cloud">(
      backendConfigured ? "cloud" : "device",
    ),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (session) return <Redirect href="/" />;
  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (mode === "signup" && !name.trim())
        throw new AppFailure("validation", "Tell us what to call you.");
      const message = await authenticate(
        email.trim(),
        password,
        mode === "signup" ? name.trim() : undefined,
        accountMode,
      );
      if (message) setError(message);
      else router.replace("/");
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <View
        style={{
          flexDirection: width > 850 ? "row" : "column",
          gap: 24,
          paddingTop: width > 850 ? 60 : 12,
        }}
      >
        <Stack style={{ flex: width > 850 ? 1 : undefined }} gap={10}>
          <Row>
            <RivlLogo size={56} />
            <Txt size="title" weight="900" style={{ fontStyle: "italic" }}>
              RIVL
            </Txt>
            <View
              style={{
                width: 9,
                height: 9,
                backgroundColor: brand.coral,
                borderRadius: 5,
              }}
            />
          </Row>
          <Txt color={c.muted} style={{ maxWidth: 410 }}>
            Your training. Your progress. Your people.
          </Txt>
        </Stack>
        <Stack
          style={{
            flex: width > 850 ? 1 : undefined,
            maxWidth: 440,
            width: "100%",
            alignSelf: "center",
            padding: width > 850 ? 28 : 0,
          }}
          gap={16}
        >
          <Segmented
            options={[
              { label: "Create account", value: "signup" },
              { label: "Sign in", value: "signin" },
            ]}
            value={mode}
            onChange={setMode}
          />
          {backendConfigured && (
            <>
              <Segmented
                options={[
                  { label: "Sync online", value: "cloud" },
                  { label: "On this device", value: "device" },
                ]}
                value={accountMode}
                onChange={setAccountMode}
              />
              <Txt size="caption" color={c.muted}>
                {accountMode === "cloud"
                  ? "Workouts can sync across your devices."
                  : "Sign in to your existing device account; its workouts stay here."}
              </Txt>
            </>
          )}
          {accountMode === "cloud" &&
            backendConfigured &&
            config.googleSignInEnabled && (
              <Button
                title="Continue with Google"
                variant="secondary"
                disabled={
                  !backendConfigured || !config.googleSignInEnabled || busy
                }
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await authenticateProvider("google");
                  } catch (e) {
                    setError(userMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          {accountMode === "cloud" &&
            backendConfigured &&
            config.appleSignInEnabled && (
              <Button
                title="Continue with Apple"
                variant="secondary"
                disabled={
                  !backendConfigured || !config.appleSignInEnabled || busy
                }
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await authenticateProvider("apple");
                  } catch (e) {
                    setError(userMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            )}
          {!backendConfigured && (
            <Txt size="caption" color={c.muted}>
              Your account and workouts stay on this device.
            </Txt>
          )}
          {mode === "signup" && (
            <Field
              label="Your name"
              testID="auth-name"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={100}
            />
          )}
          <Field
            label="Email"
            testID="auth-email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            maxLength={254}
          />
          <Field
            label="Password"
            testID="auth-password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            maxLength={128}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            onSubmitEditing={() => void submit()}
          />
          {!!error && <Notice text={error} />}
          <Button
            testID="auth-submit"
            title={mode === "signup" ? "Create account" : "Sign in"}
            onPress={submit}
            loading={busy}
            icon={<ArrowRight size={19} color={brand.ink} />}
          />
          <Txt size="caption" color={c.muted}>
            You choose what you share. Every activity starts private.
          </Txt>
          {accountMode === "cloud" && backendConfigured && (
            <Button
              testID="auth-forgot"
              title="Forgot password?"
              variant="secondary"
              onPress={() => router.push("/forgot-password")}
            />
          )}
        </Stack>
      </View>
    </Screen>
  );
}
