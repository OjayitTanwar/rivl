import * as Crypto from "expo-crypto";
import { database } from "../storage/database";
import { supabase } from "./supabase";
import { RouteRepository } from "./route-repository";
import { AppFailure } from "../security/errors";
export async function cloudAccessToken(owner: string): Promise<string> {
  if (!supabase)
    throw new AppFailure("offline", "Cloud sync is not configured.", true);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== owner || !data.session.access_token)
    throw new AppFailure(
      "auth",
      "Your account changed. Local routes are safe; sync again from the correct account.",
    );
  return data.session.access_token;
}
export async function assertCurrentCloudUser(owner: string): Promise<void> {
  await cloudAccessToken(owner);
}
export const routeRepository = new RouteRepository(
  database,
  {
    async write({ owner, id, route }) {
      if (!supabase)
        throw new AppFailure(
          "offline",
          "Routes are saved on this device. Cloud sync is not configured.",
          true,
        );
      const token = await cloudAccessToken(owner);
      const request = route
        ? supabase.from("routes").upsert({
            id,
            owner_id: owner,
            name: route.name,
            sport: route.sport,
            points: route.points,
            distance: route.distance,
            ascent: route.ascent,
            surface: route.surface,
            saved: route.saved,
            waypoints: route.waypoints ?? [],
            routing: route.routing ?? "recorded",
          })
        : supabase.from("routes").delete().eq("id", id).eq("owner_id", owner);
      const result = await request.setHeader(
        "Authorization",
        `Bearer ${token}`,
      );
      if (result.error) throw result.error;
      await assertCurrentCloudUser(owner);
    },
  },
  () => Crypto.randomUUID(),
);
