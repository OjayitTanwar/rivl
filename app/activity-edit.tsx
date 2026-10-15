import React, { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  Row,
  Txt,
  Field,
  Button,
  Segmented,
  Notice,
  Metric,
} from "../src/ui/primitives";
import RouteMap from "../src/ui/RouteMap";
import { useTheme } from "../src/ui/theme";
import { km, duration } from "../src/domain/format";
import { userMessage } from "../src/security/errors";
import type { Activity, Visibility } from "../src/domain/types";
function Editor({ activity: a }: { activity: Activity }) {
  const { editActivity } = useStore();
  const { c } = useTheme();
  const [title, setTitle] = useState(a.title),
    [note, setNote] = useState(a.note),
    [rpe, setRpe] = useState(String(a.rpe)),
    [visibility, setVisibility] = useState<Visibility>(a.visibility),
    [error, setError] = useState("");
  const [baseRevision] = useState(a.revision);
  const save = async () => {
    setError("");
    try {
      await editActivity(a.id, baseRevision, {
        title,
        note,
        rpe: Number(rpe),
        visibility,
      });
      router.back();
    } catch (e) {
      setError(userMessage(e));
    }
  };
  return (
    <Screen title="Edit activity" back>
      <Stack gap={20}>
        {!!a.route.length && (
          <RouteMap points={a.route} height={200} borderRadius={14} />
        )}
        <Row>
          <Metric value={km(a.summary.distance)} unit="km" label="Distance" />
          <Metric value={duration(a.summary.moving)} label="Moving time" />
        </Row>
        <Field
          label="Title"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
        <Field
          label="Notes"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={10000}
          style={{ minHeight: 100, textAlignVertical: "top" }}
        />
        <Field
          label="Perceived effort (1–10)"
          value={rpe}
          onChangeText={setRpe}
          keyboardType="number-pad"
          maxLength={2}
        />
        <Txt size="caption" color={c.muted}>
          1 is very easy; 10 is your hardest effort. Changing effort updates
          duration-based training load. Sensor-based load stays based on
          recorded data.
        </Txt>
        <Txt weight="600">Who can see this activity?</Txt>
        <Segmented
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: "private", label: "Only you" },
            { value: "friends", label: "Friends" },
            { value: "public", label: "Everyone" },
          ]}
        />
        <Txt size="caption" color={c.muted}>
          Choosing Friends or Everyone shares through your existing account when
          sync is available. Your GPS data and recorded measurements stay
          intact.
        </Txt>
        {!!error && <Notice text={error} />}
        <Button title="Save changes" onPress={save} />
      </Stack>
    </Screen>
  );
}
export default function ActivityEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, activities } = useStore();
  const activity = activities.find(
    (a) => a.id === id && a.ownerId === profile?.id,
  );
  if (!activity)
    return (
      <Screen title="Edit activity" back>
        <Notice text="This activity is unavailable or belongs to another athlete." />
      </Screen>
    );
  // Keep the original version while editing so concurrent changes are rejected, not silently overwritten.
  return (
    <Editor key={activity.ownerId + ":" + activity.id} activity={activity} />
  );
}
