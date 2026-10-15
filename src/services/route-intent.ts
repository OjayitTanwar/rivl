import { supabase } from "./supabase";
import { localRouteIntent, type RouteIntent } from "../domain/route-intent";
export async function readRouteIntent(text: string): Promise<RouteIntent> {
  const local = localRouteIntent(text);
  if (process.env.EXPO_PUBLIC_ENABLE_ROUTE_INTENT !== "true" || !supabase)
    return local;
  const { data, error } = await supabase.functions.invoke("route-intent", {
    body: { text },
    signal: AbortSignal.timeout(8000),
  });
  if (error || data?.configured !== true) return local;
  const result = data.intent as RouteIntent | undefined;
  if (
    !result ||
    !["run", "ride", "walk", "hike", null].includes(result.sport) ||
    !(
      result.meters === null ||
      (Number.isFinite(result.meters) &&
        result.meters >= 1000 &&
        result.meters <= 20000)
    )
  )
    return local;
  return { ...result, source: "typesafe" };
}
