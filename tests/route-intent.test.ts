import { it, expect } from "vitest";
import {
  localRouteIntent,
  routeIntentRequest,
  decodeRouteIntent,
} from "../src/domain/route-intent";
it("reads explicit single requests locally and preserves ambiguity", () => {
  expect(localRouteIntent("a 5 km walk around me")).toMatchObject({
    sport: "walk",
    meters: 5000,
    source: "local",
    uncertain: false,
  });
  expect(localRouteIntent("run or ride for 5 km or 10 km").uncertain).toBe(
    true,
  );
  expect(localRouteIntent("a 500 km ride").meters).toBeNull();
});
it("builds closed-set candidate questions and rejects low-confidence or invented distances", () => {
  const text = "not 10 km, a 5 km ride",
    request = routeIntentRequest(text);
  expect(request.questions.distance.criteria).toHaveProperty("none");
  const answer = (choice: string, confidence = 1) => ({
    type: "choice",
    choice,
    confidence,
    probabilities: { [choice]: 1 },
  });
  expect(
    decodeRouteIntent(text, {
      answers: { sport: answer("ride"), distance: answer("distance_1") },
    }),
  ).toMatchObject({ sport: "ride", meters: 5000, uncertain: false });
  expect(
    decodeRouteIntent(text, {
      answers: { sport: answer("ride", 0.2), distance: answer("invented") },
    }).uncertain,
  ).toBe(true);
});
