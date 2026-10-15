import type { CoachFacts } from "../domain/types";
export interface CoachNarrator {
  explain(facts: CoachFacts): Promise<string>;
}
export function explainFacts(f: CoachFacts): string {
  const parts: string[] = [];
  if (f.paceChange !== null && f.evidence >= 1)
    parts.push(
      `Your latest comparable run was ${Math.abs(f.paceChange).toFixed(1)}% ${f.paceChange >= 0 ? "faster" : "slower"} than your recent baseline.`,
    );
  if (f.efficiencyChange !== null && Math.abs(f.efficiencyChange) > 1)
    parts.push(
      `Speed per heartbeat ${f.efficiencyChange > 0 ? "improved" : "decreased"} by ${Math.abs(f.efficiencyChange).toFixed(1)}%.`,
    );
  if (f.highFatigue)
    parts.push(
      "Your short-term load is above your longer-term baseline. Keep your next session easy.",
    );
  else if (f.recommendation === "rest")
    parts.push(
      "You have trained on a full week of sessions. Make room for rest.",
    );
  else
    parts.push(
      "Build with a comfortable, conversational effort. Consistency is the work.",
    );
  if (f.evidence === 0)
    parts.unshift(
      "A few comparable activities will help reveal your training patterns.",
    );
  return parts.join(" ");
}
export const coach: CoachNarrator = {
  async explain(f) {
    return explainFacts(f);
  },
};
// Optional remote narration receives verified facts only, never raw coordinates or metrics to calculate.
