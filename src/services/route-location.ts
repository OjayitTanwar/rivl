import { Platform } from "react-native";
import * as Location from "expo-location";
import type { Coordinate } from "../domain/types";
import { coordinate } from "../domain/route-planning";
import { AppFailure } from "../security/errors";
import { textInput } from "../security/validation";
import { config } from "./config";
import { apiFetch } from "../security/transport";

async function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new AppFailure(
                "timeout",
                "Location is taking too long. Search for a place or try again outdoors.",
                true,
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function plannerLocation(): Promise<Coordinate> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new AppFailure(
      "forbidden",
      "Allow location in Settings to centre on you. You can still search or move the map.",
    );
  const cached = await Location.getLastKnownPositionAsync({
    maxAge: 60_000,
    requiredAccuracy: 100,
  }).catch(() => null);
  const position =
    cached ??
    (await deadline(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      12_000,
    ));
  return coordinate({
    lat: position.coords.latitude,
    lng: position.coords.longitude,
  });
}
export async function searchPlace(query: string): Promise<Coordinate[]> {
  const address = textInput(query, "Place", 200);
  const pair = address.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) return [coordinate({ lat: Number(pair[1]), lng: Number(pair[2]) })];
  if (Platform.OS === "web")
    throw new AppFailure(
      "validation",
      "On web, search with latitude, longitude. Address search is available in the iPhone and Android app.",
    );
  if (Platform.OS === "android") {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted)
      throw new AppFailure(
        "forbidden",
        "Android needs location permission to search places. Allow it in Settings, or tap on the map.",
      );
  }
  const results = await deadline(Location.geocodeAsync(address), 12_000);
  return results
    .slice(0, 5)
    .map((p) => coordinate({ lat: p.latitude, lng: p.longitude }));
}

export interface PlaceSuggestion {
  provider?: "google" | "osm";
  id: string;
  name: string;
  detail: string;
  coordinate: Coordinate;
}

export async function suggestPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const address = textInput(query, "Place", 200);
  if (address.trim().length < 3) return [];
  const pair = address.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (pair) {
    const point = coordinate({ lat: Number(pair[1]), lng: Number(pair[2]) });
    return [
      {
        id: "coordinates",
        name: address,
        detail: "Coordinates",
        coordinate: point,
      },
    ];
  }
  if (config.googleMapsKey) {
    const response = await apiFetch(
      "https://places.googleapis.com",
      fetch,
      12000,
    )("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.googleMapsKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({
        textQuery: address,
        pageSize: 5,
        languageCode: "en",
      }),
    });
    if (!response.ok)
      throw new AppFailure(
        "server",
        "Google place search is unavailable. Check your key or daily quota.",
        true,
      );
    const data = (await response.json()) as {
      places?: Array<{
        id: string;
        displayName?: { text?: string };
        formattedAddress?: string;
        location?: { latitude: number; longitude: number };
      }>;
    };
    return (data.places ?? []).slice(0, 5).flatMap((p) =>
      p.location
        ? [
            {
              id: p.id,
              name: p.displayName?.text ?? p.formattedAddress ?? "Place",
              detail: p.formattedAddress ?? "",
              provider: "google" as const,
              coordinate: coordinate({
                lat: p.location.latitude,
                lng: p.location.longitude,
              }),
            },
          ]
        : [],
    );
  }
  const response = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=5`,
    { signal },
  );
  if (!response.ok) throw new Error("Place suggestions are unavailable.");
  const data = (await response.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: Record<string, string | undefined>;
    }>;
  };
  return (data.features ?? []).flatMap((feature, index) => {
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    if (typeof lat !== "number" || typeof lng !== "number") return [];
    const p = feature.properties ?? {};
    const name = p.name || p.street || p.city || "Place";
    const detail = [
      p.street !== name ? p.street : undefined,
      p.city,
      p.state,
      p.country,
    ]
      .filter(Boolean)
      .filter((part, i, all) => all.indexOf(part) === i)
      .join(", ");
    return [
      {
        id: `${p.osm_id ?? index}:${lat}:${lng}`,
        name,
        detail,
        coordinate: coordinate({ lat, lng }),
      },
    ];
  });
}
