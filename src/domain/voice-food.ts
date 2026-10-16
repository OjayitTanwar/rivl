import { AppFailure } from "../security/errors";
export type VoiceFoodDraft = { query: string; grams: number | null };
/** Bounded transcription aid. Never identifies a database food or saves a meal. */
export function voiceFoodDraft(raw: string): VoiceFoodDraft {
  if (
    typeof raw !== "string" ||
    !raw.trim() ||
    raw.length > 300 ||
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/i.test(raw)
  )
    throw new AppFailure(
      "validation",
      "Use a short food name and an optional measured gram amount.",
    );
  const text = raw.normalize("NFC").trim();
  // Only an explicit numeric gram amount may prefill weight. Multiple quantities,
  // portions, ounces, calories and inferred serving sizes stay unconfirmed.
  const matches = [...text.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:grams?|g)\b/gi)];
  if (matches.length !== 1) return { query: text.slice(0, 80), grams: null };
  const match = matches[0]!;
  if (match.index! > 0 && /[-+/.\d]/.test(text[match.index! - 1]!))
    return { query: text.slice(0, 80), grams: null };
  const amount = Number(match[1]!.replace(",", "."));
  const remainder = (
    text.slice(0, match.index) + text.slice(match.index! + match[0].length)
  )
    .replace(/^\s*(?:of\s+)?/i, "")
    .replace(/[.,;:]+$/, "")
    .trim();
  // A second item/quantity means this is a meal description, not one measured food.
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 10000 ||
    !remainder ||
    /\b(?:and|plus|with)\b|\d/.test(remainder.toLowerCase())
  )
    return { query: text.slice(0, 80), grams: null };
  return { query: remainder.slice(0, 80), grams: amount };
}
