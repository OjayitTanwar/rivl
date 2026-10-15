import {adminClient,json} from "../_shared/admin.ts";
import {routeIntentRequest,decodeRouteIntent} from "../../../src/domain/route-intent.ts";
Deno.serve(async request=>{
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  const key=Deno.env.get("TYPESAFE_API_KEY");
  // Disabled in the free build. An operator must explicitly allow external API spending.
  if(Deno.env.get("RIVL_TYPESAFE_SPENDING_ENABLED")!=="true"||!key)return json({configured:false});
  const bearer=request.headers.get("Authorization")?.match(/^Bearer ([A-Za-z0-9._-]+)$/)?.[1];
  if(!bearer||bearer.length>8192)return json({error:"sign_in_required"},401);
  try{
    const admin=adminClient(),auth=await admin.auth.getUser(bearer);if(auth.error||!auth.data.user)return json({error:"sign_in_required"},401);
    if(Number(request.headers.get("content-length")??0)>4096)return json({error:"request_too_large"},413);
    const body=await request.text();if(body.length>4096)return json({error:"request_too_large"},413);
    const text=JSON.parse(body)?.text;if(typeof text!=="string"||text.trim().length<2||text.length>500)return json({error:"invalid_request"},400);
    const budget=await admin.rpc("route_intent_allow",{p_owner:auth.data.user.id});if(budget.error)throw budget.error;if(budget.data!==true)return json({error:"daily_limit"},429);
    const response=await fetch("https://api.typesafe.ai/v1/systemone",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify(routeIntentRequest(text)),signal:AbortSignal.timeout(6000),redirect:"error"});
    if(!response.ok)return json({error:"intent_temporarily_unavailable"},503);
    const raw=await response.text();if(raw.length>64000)throw new Error("oversized_response");
    return json({configured:true,intent:decodeRouteIntent(text,JSON.parse(raw))});
  }catch{return json({error:"intent_temporarily_unavailable"},503);}
});
