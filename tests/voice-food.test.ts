import { describe, it, expect } from "vitest";
import { voiceFoodDraft } from "../src/domain/voice-food";
describe("confirmed voice food drafts", () => {
  it("prefills only explicit numeric grams for a single named food", () => {
    expect(voiceFoodDraft("120 grams of banana")).toEqual({
      query: "banana",
      grams: 120,
    });
    expect(voiceFoodDraft("rolled oats 42.5 g")).toEqual({
      query: "rolled oats",
      grams: 42.5,
    });
  });
  it("does not infer servings, calories, ounces or spoken ambiguous amounts", () => {
    for (const text of [
      "one banana",
      "a cup of oats",
      "200 calories of rice",
      "8 ounces chicken",
      "one hundred grams pasta",
    ])
      expect(voiceFoodDraft(text).grams).toBeNull();
  });
  it("does not assign combined meal quantities to one food", () => {
    for (const text of [
      "100g oats and 50g milk",
      "100 grams rice with beans",
      "100 grams",
      "0 grams rice",
      "10001 grams rice",
      "-50 grams rice",
      "1/2 grams rice",
      ".5 grams rice",
    ])
      expect(voiceFoodDraft(text).grams).toBeNull();
  });
  it("bounds transcription length and rejects control content", () => {
    expect(() => voiceFoodDraft("x".repeat(301))).toThrow();
    expect(() => voiceFoodDraft("banana\u0000")).toThrow();
    expect(voiceFoodDraft("a".repeat(100)).query.length).toBe(80);
  });
});
