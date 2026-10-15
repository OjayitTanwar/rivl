import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/state/store";
import { Screen, Txt, Field, Button, Notice, Segmented } from "../src/ui/primitives";
import { reportContent, reportReasons, type ReportReason } from "../src/services/safety";
import { userMessage } from "../src/security/errors";
export default function Report() {
  const {session} = useStore();
  const {kind,target} = useLocalSearchParams<{kind?:string;target?:string}>();
  const [reason,setReason] = useState<ReportReason>("harassment");
  const [details,setDetails] = useState("");
  const [sent,setSent] = useState(false);
  const [error,setError] = useState("");
  const valid = typeof target === "string" && (kind === "activity" || kind === "comment");
  return <Screen title={sent ? "Report received" : "Report content"} back>
    {sent ? <><Txt>{session?.local ? "Development report saved on this device. It has not been sent to a moderation team." : "Your report has been submitted for review. The athlete cannot see who submitted it."}</Txt><Button title="Done" onPress={()=>router.back()} /></> : <>
      <Txt>Tell us what needs attention. Include relevant context without sharing passwords or private contact details.</Txt>
      <Segmented options={reportReasons.map(value=>({value,label:value[0]!.toUpperCase()+value.slice(1)}))} value={reason} onChange={setReason} />
      <Field label="Additional details" value={details} onChangeText={setDetails} multiline maxLength={2000} />
      {!!error && <Notice text={error} />}
      {!valid && <Notice text="This content link is invalid. Return to the activity and report it there." />}
      <Button title="Submit report" disabled={!session || !valid} onPress={async()=>{if(!session||!valid)return;setError("");try{await reportContent(session,kind,target,reason,details);setSent(true);}catch(error){setError(userMessage(error));}}} />
    </>}
  </Screen>;
}
