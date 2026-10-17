import { userMessage } from "../src/security/errors";
import React, { useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { router, Redirect, useLocalSearchParams } from "expo-router";
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
import { ConfirmEmail } from "../src/ui/ConfirmEmail";
import { emailInput, passwordInput } from "../src/security/validation";
import { RivlLogo } from "../src/ui/RivlLogo";
export default function Auth() {
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();
  const { session, authenticate, authenticateProvider } = useStore(),
    { c } = useTheme(),
    { width } = useWindowDimensions(),
    [mode, setMode] = useState<"signup" | "signin">(
      requestedMode === "signin" ? "signin" : "signup",
    ),
    [accountMode, setAccountMode] = useState<"device" | "cloud">(
      backendConfigured ? "cloud" : "device",
    ),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState<{
      email: string;
      cooldown: boolean;
    } | null>(null),
    [fieldErrors, setFieldErrors] = useState<{
      name?: string;
      email?: string;
      password?: string;
    }>({});
  const pending = useRef(false);
  if (session) return <Redirect href="/" />;
  async function submit() {
    if (pending.current) return;
    const invalid: typeof fieldErrors = {};
    if (mode === "signup" && !name.trim()) invalid.name = "Enter your name.";
    try {
      emailInput(email.trim());
    } catch (e) {
      invalid.email = email.trim()
        ? "Enter a valid email address."
        : "Enter your email address.";
    }
    try {
      passwordInput(password, mode === "signup");
    } catch (e) {
      invalid.password =
        mode === "signup"
          ? "Use at least 12 characters."
          : "Enter your password.";
    }
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const message = await authenticate(
        email.trim(),
        password,
        mode === "signup" ? name.trim() : undefined,
        accountMode,
      );
      if (message) {
        setConfirmation({ email: email.trim(), cooldown: true });
        setPassword("");
      } else router.replace("/");
    } catch (e) {
      if ((e as { code?: string })?.code === "email_not_confirmed") {
        setConfirmation({ email: email.trim(), cooldown: false });
        setPassword("");
      } else setError(userMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  if (confirmation)
    return (
      <ConfirmEmail
        email={confirmation.email}
        initialCooldown={confirmation.cooldown}
        onSignIn={() => {
          setConfirmation(null);
          setMode("signin");
          setError("");
          setFieldErrors({});
        }}
        onEdit={() => {
          setConfirmation(null);
          setMode("signup");
          setError("");
          setFieldErrors({});
        }}
      />
    );
  return (
    <Screen contentStyle={{ gap: 20, paddingBottom: 32 }}>
      <View
        style={{
          flexDirection: width > 850 ? "row" : "column",
          gap: 24,
          paddingTop: width > 850 ? 60 : 12,
        }}
      >
        <Stack style={{ flex: width > 850 ? 1 : undefined }} gap={10}>
          <Row>
            <RivlLogo size={40} />
            <Txt size="heading" weight="900" style={{ fontStyle: "italic" }}>
              RIVL
            </Txt>
            <View
              style={{
                width: 6,
                height: 6,
                backgroundColor: brand.coral,
                borderRadius: 5,
              }}
            />
          </Row>
        </Stack>
        <Stack
          style={{
            flex: width > 850 ? 1 : undefined,
            maxWidth: 440,
            width: "100%",
            alignSelf: "center",
            padding: width > 850 ? 28 : 0,
          }}
          gap={20}
        >
          <Stack gap={8}>
            <Txt size="heading" weight="700">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </Txt>
            <Txt size="caption" color={c.muted}>
              {mode === "signup"
                ? accountMode === "cloud"
                  ? "Save your workouts and join the community."
                  : "Keep your workouts on this device."
                : "Sign in to pick up your training."}
            </Txt>
          </Stack>
          <Segmented
            options={[
              { label: "Create account", value: "signup" },
              { label: "Sign in", value: "signin" },
            ]}
            value={mode}
            onChange={(value) => {
              if (!busy) {
                setMode(value);
                setError("");
                setFieldErrors({});
              }
            }}
          />
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
          {!!error && <Notice text={error} />}
          {mode === "signup" && (
            <Field
              label="Your name"
              testID="auth-name"
              value={name}
              onChangeText={(value) => {
                setName(value);
                setFieldErrors((old) => ({ ...old, name: undefined }));
              }}
              error={fieldErrors.name}
              editable={!busy}
              autoComplete="name"
              maxLength={100}
            />
          )}
          <Field
            label="Email"
            testID="auth-email"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFieldErrors((old) => ({ ...old, email: undefined }));
            }}
            error={fieldErrors.email}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!busy}
            autoComplete="email"
            maxLength={254}
          />
          <Field
            label="Password"
            testID="auth-password"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFieldErrors((old) => ({ ...old, password: undefined }));
            }}
            error={fieldErrors.password}
            secureTextEntry
            helper={mode === "signup" ? "At least 12 characters" : undefined}
            editable={!busy}
            maxLength={128}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            onSubmitEditing={() => void submit()}
          />
          <Button
            testID="auth-submit"
            title={
              busy
                ? mode === "signup"
                  ? "Creating account…"
                  : "Signing in…"
                : mode === "signup"
                  ? "Create account"
                  : "Sign in"
            }
            onPress={submit}
            loading={busy}
            icon={<ArrowRight size={19} color={brand.ink} />}
          />
          {backendConfigured && (
            <Button
              title={
                accountMode === "cloud"
                  ? "Use an account on this device instead"
                  : "Use a cloud account instead"
              }
              variant="quiet"
              disabled={busy}
              onPress={() => {
                setAccountMode(accountMode === "cloud" ? "device" : "cloud");
                setError("");
                setFieldErrors({});
              }}
            />
          )}
          {accountMode === "cloud" && backendConfigured && (
            <Button
              testID="auth-forgot"
              title="Forgot password?"
              variant="quiet"
              disabled={busy}
              onPress={() => router.push("/forgot-password")}
            />
          )}
        </Stack>
      </View>
    </Screen>
  );
}
