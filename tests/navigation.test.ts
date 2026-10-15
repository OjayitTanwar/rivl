import { describe, it, expect } from "vitest";
import {
  decodeGuidedRoute,
  navigationProgress,
  approachInstruction,
} from "../src/domain/navigation";
const response = {
  code: "Ok",
  routes: [
    {
      distance: 222,
      geometry: {
        type: "LineString",
        coordinates: [
          [0, 0],
          [0.001, 0],
          [0.002, 0],
        ],
      },
      legs: [
        {
          steps: [
            { maneuver: { location: [0, 0], type: "depart" } },
            {
              maneuver: {
                location: [0.001, 0],
                type: "turn",
                modifier: "left",
              },
              name: "Park Road",
            },
            { maneuver: { location: [0.002, 0], type: "arrive" } },
          ],
        },
      ],
    },
  ],
};
describe("turn guidance", () => {
  it("decodes turns and approaches without treating inaccurate GPS as off route", () => {
    const route = decodeGuidedRoute(response);
    const p = navigationProgress(route, { lat: 0, lng: 0.0005 }, 10);
    expect(p.step.instruction).toBe("Turn left onto Park Road.");
    expect(approachInstruction(p)).toContain("turn left");
    expect(
      navigationProgress(route, { lat: 0.001, lng: 0.0005 }, 80).offRoute,
    ).toBe(false);
  });
  it("recognizes arrival", () => {
    const route = decodeGuidedRoute(response);
    expect(navigationProgress(route, { lat: 0, lng: 0.002 }, 5).arrived).toBe(
      true,
    );
  });
});
