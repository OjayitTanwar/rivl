import React, { useCallback, useEffect, useState } from "react";
import { useStore } from "../src/state/store";
import { blockedAthletes, setBlocked } from "../src/services/safety";
import { Screen, Txt, ListRow, Button, Notice } from "../src/ui/primitives";
import { userMessage } from "../src/security/errors";
export default function Blocked() {
  const {session,refresh,sync} = useStore();
  const [ids,setIds] = useState<string[]>([]), [error,setError] = useState(""), [loading,setLoading] = useState(true);
  const reload = useCallback(async()=>{if(!session)return;setLoading(true);try{setIds(await blockedAthletes(session));setError("");}catch(error){setError(userMessage(error));}finally{setLoading(false);}},[session]);
  useEffect(()=>{void reload();},[reload]);
  return <Screen title="Blocked athletes" back>
    <Txt>Blocking hides each athlete’s shared activities and interactions from you. Their profile is hidden while the block is active.</Txt>
    {!!error && <Notice text={error} retry={reload} />}
    {loading ? <Txt>Loading your block list…</Txt> : !ids.length && <Txt>You haven’t blocked anyone.</Txt>}
    {ids.map((id,index)=><ListRow key={id} title={`Blocked athlete ${index+1}`} detail={id} tail={<Button title="Unblock" variant="quiet" onPress={async()=>{if(!session)return;await setBlocked(session,id,false);await reload();await refresh();await sync();}} />} />)}
  </Screen>;
}
