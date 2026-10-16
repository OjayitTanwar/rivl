import React, { useCallback, useEffect, useState } from "react";
import { useStore } from "../src/state/store";
import { blockedAthletes, setBlocked } from "../src/services/safety";
import { Screen, Txt, ListRow, Button, Notice, Empty, Stack, SectionHeading } from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
import { useTheme } from "../src/ui/theme";
export default function Blocked() {
  const { session, refresh, sync } = useStore();
  const { c } = useTheme();
  const [ids, setIds] = useState<string[]>([]), [error, setError] = useState(""), [loading, setLoading] = useState(true), [pending, setPending] = useState("");
  const reload = useCallback(async () => {
    if (!session) { setIds([]); setLoading(false); return; }
    setLoading(true);
    try { setIds(await blockedAthletes(session)); setError(""); }
    catch (error) { setError(userMessage(error)); }
    finally { setLoading(false); }
  }, [session]);
  useEffect(() => { void reload(); }, [reload]);
  return <Screen title="Blocked athletes" back>
    <Stack gap={8}>
      <SectionHeading title="Your community, your choice" />
      <Txt color={c.muted}>Blocking hides an athlete’s profile, shared activities and interactions from you. You can unblock them here.</Txt>
    </Stack>
    {!!error && <Notice text={error} retry={reload} />}
    {loading ? <Txt color={c.muted}>Loading your block list…</Txt> : !ids.length && !error && <Empty title="No blocked athletes" body="If someone’s interactions aren’t welcome, block them from their profile. You can review that choice here anytime." />}
    {ids.map((id, index) => <ListRow key={id} title={`Blocked athlete ${index + 1}`} tail={<Button title="Unblock" variant="quiet" disabled={!!pending} loading={pending === id} onPress={async () => {
      if (!session || pending) return;
      setPending(id);
      try { await setBlocked(session, id, false); await reload(); await refresh(); await sync(); }
      catch (error) { setError(userMessage(error)); }
      finally { setPending(""); }
    }} />} />)}
  </Screen>;
}
