type Sport = "run" | "ride" | "walk" | "hike";
export interface RouteIntent {
  sport: Sport | null;
  meters: number | null;
  source: "local" | "typesafe";
  uncertain: boolean;
}
export function distanceCandidates(text: string) {
  return [
    ...text.matchAll(
      /\b(\d+(?:\.\d+)?)\s*(kilomet(?:er|re)s?|km|miles?|mi|met(?:er|re)s?|m)\b/gi,
    ),
  ]
    .slice(0, 8)
    .map((match, i) => ({
      id: `distance_${i}`,
      text: match[0],
      meters:
        Number(match[1]) *
        (/^k/i.test(match[2]!) ? 1000 : /^mi/i.test(match[2]!) ? 1609.344 : 1),
    }))
    .filter((p) => p.meters >= 1000 && p.meters <= 20000);
}
export function localRouteIntent(text: string): RouteIntent {
  const sports = (
    [
      ["run", /\b(run|running|jog|jogging)\b/i],
      ["ride", /\b(ride|riding|bike|cycle|cycling)\b/i],
      ["walk", /\b(walk|walking)\b/i],
      ["hike", /\b(hike|hiking)\b/i],
    ] as const
  ).filter(([, pattern]) => pattern.test(text));
  const distances = distanceCandidates(text);
  return {
    sport: sports.length === 1 ? sports[0]![0] : null,
    meters: distances.length === 1 ? distances[0]!.meters : null,
    source: "local",
    uncertain: sports.length !== 1 || distances.length !== 1,
  };
}
export function routeIntentRequest(text: string) {
  const candidates = distanceCandidates(text);
  return {
    model: "jev-latest",
    state: { request: text, candidates },
    questions: {
      sport: {
        type: "choice",
        instructions:
          "Which one activity does the athlete request in `request`? Select only an explicitly requested activity. Ambiguous, multiple or unstated activities are none.",
        criteria: {
          run: "Running or jogging",
          ride: "Cycling or bicycle riding",
          walk: "Walking",
          hike: "Hiking",
          none: "No single requested activity",
        },
      },
      distance: {
        type: "choice",
        instructions:
          "Which entry in `candidates` is the requested total route distance in `request`? Select a verbatim candidate, excluding rejected, comparison or alternative distances. Choose none for an ambiguous or absent total distance.",
        criteria: Object.fromEntries([
          ...candidates.map((p) => [p.id, p.text]),
          ["none", "No unique requested route distance"],
        ]),
      },
    },
  };
}
export function decodeRouteIntent(text: string, value: unknown): RouteIntent {
  const result = value as {
    answers?: Record<
      string,
      {
        type?: unknown;
        choice?: unknown;
        confidence?: unknown;
        probabilities?: Record<string, unknown>;
      }
    >;
  };
  const choose = (key: string, allowed: string[]) => {
    const answer = result?.answers?.[key];
    if (
      answer?.type !== "choice" ||
      typeof answer.choice !== "string" ||
      !allowed.includes(answer.choice) ||
      typeof answer.confidence !== "number" ||
      answer.confidence < 0.85 ||
      answer.confidence > 1 ||
      typeof answer.probabilities?.[answer.choice] !== "number" ||
      (answer.probabilities[answer.choice] as number) < 0.85
    )
      return null;
    return answer.choice;
  };
  const candidates = distanceCandidates(text),
    sport = choose("sport", ["run", "ride", "walk", "hike", "none"]),
    distance = choose("distance", [...candidates.map((p) => p.id), "none"]);
  return {
    sport: sport && sport !== "none" ? (sport as Sport) : null,
    meters: candidates.find((p) => p.id === distance)?.meters ?? null,
    source: "typesafe",
    uncertain: !sport || sport === "none" || !distance || distance === "none",
  };
}
