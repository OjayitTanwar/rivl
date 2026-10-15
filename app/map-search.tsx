import React, { useEffect, useState } from "react";
import { Keyboard } from "react-native";
import { router } from "expo-router";
import { MapPin, Search } from "lucide-react-native";
import {
  Screen,
  Field,
  ListRow,
  Txt,
  Notice,
  Empty,
} from "../src/ui/primitives";
import { LoadingJourney } from "../src/ui/LoadingJourney";
import { useTheme } from "../src/ui/theme";
import {
  suggestPlaces,
  type PlaceSuggestion,
} from "../src/services/route-location";
import { userMessage } from "../src/security/errors";
export default function MapSearch() {
  const { c } = useTheme();
  const [query, setQuery] = useState(""),
    [places, setPlaces] = useState<PlaceSuggestion[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [searched, setSearched] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    setPlaces([]);
    setError("");
    setSearched(false);
    setBusy(false);
    if (query.trim().length < 3) return () => request.abort();
    setBusy(true);
    const timer = setTimeout(() => {
      void suggestPlaces(query, request.signal)
        .then((p) => {
          if (!request.signal.aborted) {
            setPlaces(p);
            setSearched(true);
          }
        })
        .catch((e) => {
          if (!request.signal.aborted) setError(userMessage(e));
        })
        .finally(() => {
          if (!request.signal.aborted) setBusy(false);
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      request.abort();
    };
  }, [query]);
  return (
    <Screen title="Find a place" back>
      <Field
        label="Search places"
        placeholder="City, park, trailhead or coordinates"
        value={query}
        onChangeText={setQuery}
        autoFocus
        returnKeyType="search"
        autoCorrect={false}
      />
      {busy && <LoadingJourney compact label="Finding places…" />}
      {!!error && <Notice text={error} />}
      {places.map((place) => (
        <ListRow
          key={place.id}
          icon={<MapPin size={22} color={c.accent} />}
          title={place.name}
          detail={place.detail}
          onPress={() => {
            Keyboard.dismiss();
            router.navigate({
              pathname: "/(tabs)/maps",
              params: {
                lat: String(place.coordinate.lat),
                lng: String(place.coordinate.lng),
                place: place.name,
                provider: place.provider,
              },
            });
          }}
        />
      ))}
      {places.some((p) => p.provider === "google") && (
        <Txt size="micro" color={c.muted}>
          Places by Google
        </Txt>
      )}
      {searched && !busy && !places.length && !error && (
        <Empty
          title="No places found"
          body="Try a nearby town, another name, or latitude, longitude."
        />
      )}
      {!query && (
        <>
          <Search size={28} color={c.muted} />
          <Txt color={c.muted}>
            Choose a place to explore routes and paths around it.
          </Txt>
        </>
      )}
    </Screen>
  );
}
