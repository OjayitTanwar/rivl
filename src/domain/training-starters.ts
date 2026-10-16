import {
  validatePublicCreatorProgram,
  type PublicCreatorProgram,
} from "./creator-training";
/** Original RIVL schedules, released under CC0; no third-party course content. */
export const TRAINING_STARTERS: PublicCreatorProgram[] = (
  [
    {
      title: "Easy run intervals",
      sport: "run",
      workSec: 60,
      recoverySec: 120,
      repeats: 6,
    },
    {
      title: "Steady cycling",
      sport: "ride",
      workSec: 300,
      recoverySec: 180,
      repeats: 3,
    },
    {
      title: "Walking rhythm",
      sport: "walk",
      workSec: 180,
      recoverySec: 120,
      repeats: 4,
    },
    {
      title: "Hiking preparation",
      sport: "hike",
      workSec: 300,
      recoverySec: 180,
      repeats: 3,
    },
  ] as const
).map((base) =>
  validatePublicCreatorProgram({
    creatorName: "RIVL",
    title: base.title,
    description:
      "Original editable starter. Keep the effort comfortable and choose terrain and duration that suit you.",
    sport: base.sport,
    level: "all",
    weeks: 2,
    revision: 1,
    updatedAt: 1792108800000,
    license: "CC0-1.0",
    sessions: Array.from({ length: 4 }, (_, i) => ({
      id: `starter-${i + 1}`,
      week: Math.floor(i / 2) + 1,
      day: i % 2 ? 4 : 1,
      title: `${base.title} ${i + 1}`,
      notes: "Rest between sessions. Review and edit before starting.",
      workout: {
        warmupSec: 300,
        workSec: base.workSec,
        recoverySec: base.recoverySec,
        repeats: base.repeats,
        cooldownSec: 300,
      },
    })),
  }),
);
