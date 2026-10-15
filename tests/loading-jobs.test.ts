import { describe, expect, it } from "vitest";
import {
  loadingJobs,
  visibleLoadingJobs,
  type LoadingJobs,
} from "../src/domain/loading-jobs";
const empty = (): LoadingJobs => ({ jobs: new Map(), dismissed: new Set() });
describe("foreground loading lifecycle", () => {
  it("hides blurred work without completing it and preserves Continue on refocus", () => {
    const id = Symbol();
    let state = loadingJobs(empty(), { type: "begin", id, label: "Location" });
    state = loadingJobs(state, {
      type: "update",
      id,
      label: "Location",
      foreground: false,
    });
    expect(visibleLoadingJobs(state)).toEqual([]);
    expect(state.jobs.has(id)).toBe(true);
    state = loadingJobs(state, {
      type: "update",
      id,
      label: "Location",
      foreground: true,
    });
    expect(visibleLoadingJobs(state)).toEqual([[id, "Location"]]);
    state = loadingJobs(state, { type: "continue" });
    state = loadingJobs(state, {
      type: "update",
      id,
      label: "Location",
      foreground: false,
    });
    state = loadingJobs(state, {
      type: "update",
      id,
      label: "Location",
      foreground: true,
    });
    expect(visibleLoadingJobs(state)).toEqual([]);
    expect(state.dismissed.has(id)).toBe(true);
  });
  it("Continue does not dismiss unrelated background work and ended work stays ended", () => {
    const a = Symbol(),
      b = Symbol();
    let state = loadingJobs(empty(), { type: "begin", id: a, label: "Map" });
    state = loadingJobs(state, { type: "begin", id: b, label: "Paths" });
    state = loadingJobs(state, {
      type: "update",
      id: b,
      label: "Paths",
      foreground: false,
    });
    state = loadingJobs(state, { type: "continue" });
    expect(state.dismissed.has(b)).toBe(false);
    state = loadingJobs(state, {
      type: "update",
      id: b,
      label: "Paths",
      foreground: true,
    });
    expect(visibleLoadingJobs(state)).toEqual([[b, "Paths"]]);
    state = loadingJobs(state, { type: "end", id: b });
    expect(
      loadingJobs(state, {
        type: "update",
        id: b,
        label: "Paths",
        foreground: true,
      }),
    ).toBe(state);
  });
  it("keeps another real request visible when one finishes or unmounts", () => {
    const a = Symbol(),
      b = Symbol();
    let state = loadingJobs(empty(), { type: "begin", id: a, label: "Map" });
    state = loadingJobs(state, { type: "begin", id: b, label: "Paths" });
    state = loadingJobs(state, { type: "end", id: a });
    expect(visibleLoadingJobs(state)).toEqual([[b, "Paths"]]);
    expect(
      visibleLoadingJobs(loadingJobs(state, { type: "end", id: b })),
    ).toEqual([]);
  });
  it("continue dismisses current work without cancelling it or hiding new work", () => {
    const a = Symbol(),
      b = Symbol();
    let state = loadingJobs(empty(), { type: "begin", id: a, label: "Map" });
    state = loadingJobs(state, { type: "continue" });
    expect(visibleLoadingJobs(state)).toEqual([]);
    expect(state.jobs.has(a)).toBe(true);
    state = loadingJobs(state, { type: "begin", id: b, label: "Paths" });
    expect(visibleLoadingJobs(state)).toEqual([[b, "Paths"]]);
    state = loadingJobs(state, { type: "end", id: a });
    expect(state.dismissed.has(a)).toBe(false);
  });
  it("a subsequent load from the same component is visible again", () => {
    const id = Symbol();
    let state = loadingJobs(empty(), { type: "begin", id, label: "Map" });
    state = loadingJobs(state, { type: "continue" });
    state = loadingJobs(state, { type: "end", id });
    state = loadingJobs(state, { type: "begin", id, label: "Satellite" });
    expect(visibleLoadingJobs(state)).toEqual([[id, "Satellite"]]);
  });
});
