import React, { useEffect, useRef, useState } from "react";
import { Screen, Txt, Button, Notice } from "./primitives";
import { useTheme } from "./theme";
import { resendSignupConfirmation } from "../services/signup-confirmation";
import { userMessage } from "../security/errors";

export function ConfirmEmail({
  email,
  initialCooldown,
  onSignIn,
  onEdit,
}: {
  email: string;
  initialCooldown: boolean;
  onSignIn(): void;
  onEdit(): void;
}) {
  const { c } = useTheme();
  const [retryAt, setRetryAt] = useState(() =>
    initialCooldown ? Date.now() + 60000 : 0,
  );
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  return (
    <Screen title="Confirm your email" contentStyle={{ gap: 24 }}>
      <Txt>Open the confirmation link sent to</Txt>
      <Txt weight="600">{email}</Txt>
      <Txt color={c.muted}>
        Check spam too. Open the link on this phone, then return to RIVL.
      </Txt>
      {!!error && <Notice text={error} />}
      {resent && (
        <Txt accessibilityRole="alert">
          A new confirmation link was requested. Check your inbox.
        </Txt>
      )}
      <Button
        title="I’ve confirmed — sign in"
        disabled={busy}
        onPress={onSignIn}
      />
      <Button
        title={seconds ? `Resend in ${seconds}s` : "Resend confirmation email"}
        variant="secondary"
        loading={busy}
        disabled={busy || seconds > 0}
        onPress={async () => {
          if (pending.current || Date.now() < retryAt) return;
          pending.current = true;
          setBusy(true);
          setError("");
          setResent(false);
          setRetryAt(Date.now() + 60000);
          setNow(Date.now());
          try {
            await resendSignupConfirmation(email);
            setResent(true);
          } catch (e) {
            setError(userMessage(e));
          } finally {
            pending.current = false;
            setBusy(false);
          }
        }}
      />
      <Button
        title="Use a different email"
        variant="quiet"
        disabled={busy}
        onPress={onEdit}
      />
      <Txt size="caption" color={c.muted}>
        No email yet? Wait a few minutes before requesting another link.
        Delivery depends on RIVL’s email service.
      </Txt>
    </Screen>
  );
}
