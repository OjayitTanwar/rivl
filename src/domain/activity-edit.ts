import type { Activity, Visibility } from "./types";
import { textInput, numeric } from "../security/validation";
import { AppFailure } from "../security/errors";
export interface ActivityEdit {
  title: string;
  note: string;
  rpe: number;
  visibility: Visibility;
}
export function editActivityMetadata(
  activity: Activity,
  owner: string,
  expectedRevision: number,
  patch: ActivityEdit,
): Activity {
  if (activity.ownerId !== owner)
    throw new AppFailure("forbidden", "You can edit only your own activity.");
  if (activity.revision !== expectedRevision)
    throw new AppFailure(
      "validation",
      "This activity changed. Reopen the editor to use the latest version.",
    );
  if (!["private", "friends", "public"].includes(patch.visibility))
    throw new AppFailure("validation", "Choose a valid privacy setting.");
  const rpe = numeric(patch.rpe, "Perceived effort", 1, 10);
  if (!Number.isInteger(rpe))
    throw new AppFailure(
      "validation",
      "Choose a whole-number effort from 1 to 10.",
    );
  return {
    ...activity,
    title: textInput(patch.title, "Activity title", 200),
    note: textInput(patch.note, "Activity note", 10000, false),
    rpe,
    visibility: patch.visibility,
    revision: activity.revision + 1,
    summary: {
      ...activity.summary,
      load:
        activity.summary.loadMethod === "duration-rpe"
          ? (activity.summary.moving / 60) * rpe
          : activity.summary.load,
    },
  };
}
