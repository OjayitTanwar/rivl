import React, { useCallback, useRef, useState } from "react";
import { Alert, Linking, Platform, Share, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { useStore } from "../../src/state/store";
import { database } from "../../src/storage/database";
import { CreatorTrainingRepository } from "../../src/services/creator-training-repository";
import { TrainingRepository } from "../../src/services/training-repository";
import {
  creatorTrainingCloudConfigured,
  listCreatorPrograms,
  publishCreatorProgram,
  unpublishCreatorProgram,
} from "../../src/services/creator-training-cloud";
import {
  validateCreatorProgram,
  decodeCreatorProgram,
  encodeCreatorProgram,
  creatorSessionPlan,
  type CreatorProgram,
  type CreatorSession,
  type PublicCreatorProgram,
} from "../../src/domain/creator-training";
import {
  trainingSports,
  type TrainingSport,
} from "../../src/domain/guided-training";
import {
  Screen,
  Stack,
  Txt,
  Field,
  Choice,
  Segmented,
  Button,
  ListRow,
  Notice,
} from "../../src/ui/primitives";
import { SettingsSection } from "../../src/ui/SettingsSection";
import { useTheme } from "../../src/ui/theme";
import { useFullScreenLoading } from "../../src/ui/loading-state";
import { WorkspaceExit } from "../../src/ui/WorkspaceExit";
import { AppFailure, userMessage } from "../../src/security/errors";
const repository = new CreatorTrainingRepository(database);
const training = new TrainingRepository(database);
const sportLabels = { run: "Run", ride: "Ride", walk: "Walk", hike: "Hike" };
const intervals = [
  "warmupSec",
  "workSec",
  "recoverySec",
  "repeats",
  "cooldownSec",
] as const;
const intervalLabels = {
  warmupSec: "Warm up (seconds)",
  workSec: "Work interval (seconds)",
  recoverySec: "Recovery (seconds)",
  repeats: "Repetitions",
  cooldownSec: "Cool down (seconds)",
};
type Editor = {
  original: CreatorProgram | null;
  program: CreatorProgram;
  weeks: string;
};
type SessionEditor = {
  id: string;
  week: string;
  day: string;
  title: string;
  notes: string;
  values: Record<(typeof intervals)[number], string>;
};
const whole = (text: string, label: string) => {
  if (!/^\d+$/.test(text.trim()))
    throw new AppFailure("validation", `Enter a whole number for ${label}.`);
  return Number(text);
};
export default function TrainingCreators() {
  const { profile } = useStore(),
    { c } = useTheme(),
    owner = profile?.id;
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const draftOwner = useRef(owner),
    lock = useRef(false);
  const [tab, setTab] = useState<"library" | "mine">("library"),
    [programs, setPrograms] = useState<CreatorProgram[]>([]),
    [libraryState, setLibraryState] = useState<{
      owner: string | undefined;
      revision: number;
      status: "loading" | "success" | "error";
      programs: CreatorProgram[];
      error: string;
    }>({
      owner: undefined,
      revision: -1,
      status: "loading",
      programs: [],
      error: "",
    }),
    [loadedOwner, setLoadedOwner] = useState<string | undefined>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState(""),
    [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null),
    [sessionEditor, setSessionEditor] = useState<SessionEditor | null>(null),
    [preview, setPreview] = useState<
      PublicCreatorProgram | CreatorProgram | null
    >(null),
    [json, setJson] = useState(""),
    [importOpen, setImportOpen] = useState(false);
  useFullScreenLoading(loading && !!owner, "Loading training programs");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setLoadedOwner(undefined);
      setError("");
      setLibraryState({
        owner,
        revision,
        status: "loading",
        programs: [],
        error: "",
      });
      if (draftOwner.current !== owner) {
        setEditor(null);
        setSessionEditor(null);
        setPreview(null);
        setJson("");
        setImportOpen(false);
        draftOwner.current = owner;
      }
      if (!owner) {
        setPrograms([]);
        setLibraryState({
          owner: undefined,
          revision,
          status: "success",
          programs: [],
          error: "",
        });
        setLoadedOwner(undefined);
        setLoading(false);
        return;
      }
      void repository
        .programs(owner)
        .then((next) => {
          if (active) {
            setPrograms(next);
            setLoadedOwner(owner);
          }
        })
        .catch((e) => {
          if (active) setError(userMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      if (creatorTrainingCloudConfigured)
        void listCreatorPrograms()
          .then((next) => {
            if (active && ownerRef.current === owner)
              setLibraryState({
                owner,
                revision,
                status: "success",
                programs: next.map((item) => item.program),
                error: "",
              });
          })
          .catch((e) => {
            if (active) {
              if (ownerRef.current === owner)
                setLibraryState({
                  owner,
                  revision,
                  status: "error",
                  programs: [],
                  error: userMessage(e),
                });
            }
          });
      return () => {
        active = false;
      };
    }, [owner, revision]),
  );
  const ready = !!owner && loadedOwner === owner && !loading;
  const libraryCurrent =
    libraryState.owner === owner && libraryState.revision === revision;
  const libraryLoading = !libraryCurrent || libraryState.status === "loading";
  const librarySettled = libraryCurrent && libraryState.status === "success";
  const libraryError =
    libraryCurrent && libraryState.status === "error" ? libraryState.error : "";
  const library = librarySettled ? libraryState.programs : [];
  const perform = async (
    label: string,
    work: (id: string) => Promise<unknown>,
    after?: () => void,
  ) => {
    if (!ready || !owner || lock.current) return;
    const id = owner;
    lock.current = true;
    setPending(label);
    setError("");
    setNotice("");
    try {
      await work(id);
      const next = await repository.programs(id);
      if (ownerRef.current === id) {
        setPrograms(next);
        setNotice(
          label === "Publishing program"
            ? "Program published."
            : label === "Unpublishing program"
              ? "Program unpublished."
              : label === "Saving draft"
                ? "Draft saved on this account."
                : label === "Saving program copy"
                  ? "Program copy saved."
                  : label === "Deleting program"
                    ? "Local program deleted."
                    : "",
        );
        if (label === "Publishing program" || label === "Unpublishing program")
          setRevision((n) => n + 1);
        after?.();
      }
    } catch (e) {
      if (ownerRef.current === id) setError(userMessage(e));
    } finally {
      lock.current = false;
      if (ownerRef.current === id) setPending("");
    }
  };
  const confirm = (
    title: string,
    body: string,
    action: () => void,
    destructive = false,
  ) => {
    if (Platform.OS === "web") {
      if (window.confirm(body)) action();
    } else
      Alert.alert(title, body, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          style: destructive ? "destructive" : "default",
          onPress: action,
        },
      ]);
  };
  const open = (program?: CreatorProgram) => {
    if (!ready || pending || !owner) return;
    const draft: CreatorProgram = program
      ? {
          ...program,
          sessions: program.sessions.map((s) => ({
            ...s,
            workout: { ...s.workout },
          })),
        }
      : {
          id: randomUUID(),
          ownerId: owner,
          creatorName: "",
          title: "",
          description: "",
          sport: "run",
          level: "all",
          weeks: 1,
          revision: 1,
          updatedAt: Date.now(),
          license: "CC-BY-4.0",
          sessions: [],
        };
    setEditor({
      original: program ?? null,
      program: draft,
      weeks: String(draft.weeks),
    });
    setSessionEditor(null);
    setPreview(null);
    setTab("mine");
    setError("");
  };
  const update = (patch: Partial<CreatorProgram>) =>
    setEditor((old) =>
      old ? { ...old, program: { ...old.program, ...patch } } : old,
    );
  const save = () =>
    void perform(
      "Saving draft",
      async (id) => {
        if (!editor || sessionEditor)
          throw new AppFailure(
            "validation",
            "Save or cancel the session before saving your program.",
          );
        const next = validateCreatorProgram({
          ...editor.program,
          ownerId: id,
          weeks: whole(editor.weeks, "program weeks"),
          revision: editor.original ? editor.original.revision + 1 : 1,
          updatedAt: Date.now(),
        });
        await repository.save(next, editor.original);
      },
      () => setEditor(null),
    );
  const openSession = (session?: CreatorSession) => {
    setSessionEditor({
      id: session?.id ?? randomUUID(),
      week: String(session?.week ?? 1),
      day: String(session?.day ?? 1),
      title: session?.title ?? "",
      notes: session?.notes ?? "",
      values: Object.fromEntries(
        intervals.map((key) => [
          key,
          String(session?.workout[key] ?? (key === "repeats" ? 1 : 0)),
        ]),
      ) as SessionEditor["values"],
    });
  };
  const saveSession = () => {
    try {
      if (!editor || !sessionEditor) return;
      const next: CreatorSession = {
        id: sessionEditor.id,
        week: whole(sessionEditor.week, "week"),
        day: whole(sessionEditor.day, "day"),
        title: sessionEditor.title,
        notes: sessionEditor.notes,
        workout: Object.fromEntries(
          intervals.map((key) => [
            key,
            whole(sessionEditor.values[key], intervalLabels[key]),
          ]),
        ) as CreatorSession["workout"],
      };
      const sessions = [
        ...editor.program.sessions.filter((s) => s.id !== next.id),
        next,
      ];
      // Validate the complete working copy before accepting a scheduled session.
      validateCreatorProgram({
        ...editor.program,
        title: editor.program.title.trim() || "Untitled program",
        creatorName: editor.program.creatorName.trim() || "Creator",
        weeks: whole(editor.weeks, "program weeks"),
        sessions,
      });
      update({ sessions });
      setSessionEditor(null);
      setError("");
    } catch (e) {
      setError(userMessage(e));
    }
  };
  const previewImport = () => {
    try {
      setPreview(decodeCreatorProgram(json));
      setError("");
    } catch (e) {
      setPreview(null);
      setError(userMessage(e));
    }
  };
  const startSession = (program: CreatorProgram, sessionId: string) =>
    void perform(
      "Starting guidance",
      async (id) => {
        await training.start(
          id,
          creatorSessionPlan(program, sessionId, id, randomUUID()),
          randomUUID(),
        );
      },
      () => router.push("/training-session"),
    );
  return (
    <Screen
      title="Training programs"
      action={<WorkspaceExit />}
      contentStyle={{ paddingBottom: 120 }}
    >
      <Stack gap={20}>
        <Txt color={c.muted}>
          Train from a creator’s program or build your own schedule. Every
          session starts only when you choose it.
        </Txt>
        {!owner ? (
          <Notice text="Sign in to save and create training programs." />
        ) : (
          <>
            {!!error && (
              <Notice
                text={error}
                retry={!pending ? () => setRevision((n) => n + 1) : undefined}
              />
            )}
            {!!notice && (
              <View accessibilityLiveRegion="polite">
                <Txt color={c.muted}>{notice}</Txt>
              </View>
            )}
            {!!pending && (
              <View accessibilityLiveRegion="polite">
                <Txt color={c.muted}>{pending}…</Txt>
              </View>
            )}
            <Segmented
              value={tab}
              options={[
                { value: "library", label: "Library" },
                { value: "mine", label: "My programs" },
              ]}
              onChange={(value) => {
                if (!pending) setTab(value);
              }}
            />
            {editor && draftOwner.current === owner ? (
              <SettingsSection
                title={editor.original ? "Edit program" : "Create program"}
              >
                <Field
                  label="Program title"
                  value={editor.program.title}
                  onChangeText={(title) => update({ title })}
                  maxLength={100}
                  editable={!pending}
                />
                <Field
                  label="Creator name (public when published)"
                  value={editor.program.creatorName}
                  onChangeText={(creatorName) => update({ creatorName })}
                  maxLength={80}
                  editable={!pending}
                />
                <Field
                  label="Description"
                  value={editor.program.description}
                  onChangeText={(description) => update({ description })}
                  maxLength={2000}
                  multiline
                  editable={!pending}
                />
                <Choice
                  label="Sport"
                  value={editor.program.sport}
                  options={trainingSports.map((value) => ({
                    value,
                    label: sportLabels[value],
                  }))}
                  onChange={(sport) => {
                    if (!pending) update({ sport });
                  }}
                />
                <Choice
                  label="Level"
                  value={editor.program.level}
                  options={[
                    { value: "all", label: "All levels" },
                    { value: "beginner", label: "Beginner" },
                    { value: "intermediate", label: "Intermediate" },
                    { value: "advanced", label: "Advanced" },
                  ]}
                  onChange={(level) => {
                    if (!pending) update({ level });
                  }}
                />
                <Field
                  label="Program length (weeks, 1–24)"
                  value={editor.weeks}
                  onChangeText={(weeks) =>
                    setEditor((old) => (old ? { ...old, weeks } : old))
                  }
                  keyboardType="number-pad"
                  maxLength={2}
                  editable={!pending}
                />
                <Choice
                  label="License for sharing"
                  value={editor.program.license}
                  options={[
                    { value: "CC-BY-4.0", label: "CC BY 4.0 · attribution" },
                    { value: "CC0-1.0", label: "CC0 · public domain" },
                  ]}
                  onChange={(license) => {
                    if (!pending) update({ license });
                  }}
                />
                <Txt size="caption" color={c.muted}>
                  CC BY requires creator credit. CC0 permits reuse without that
                  condition. Saving a draft keeps it on this account; Publish is
                  a separate action.
                </Txt>
                <ListRow
                  title="Read license terms"
                  onPress={() =>
                    void Linking.openURL(
                      editor.program.license === "CC-BY-4.0"
                        ? "https://creativecommons.org/licenses/by/4.0/"
                        : "https://creativecommons.org/publicdomain/zero/1.0/",
                    ).catch((e) => setError(userMessage(e)))
                  }
                />
                {sessionEditor ? (
                  <Stack gap={16}>
                    <Txt weight="600">Scheduled session</Txt>
                    <Field
                      label="Session title"
                      value={sessionEditor.title}
                      onChangeText={(title) =>
                        setSessionEditor((old) =>
                          old ? { ...old, title } : old,
                        )
                      }
                      maxLength={100}
                    />
                    <Field
                      label="Week"
                      value={sessionEditor.week}
                      onChangeText={(week) =>
                        setSessionEditor((old) =>
                          old ? { ...old, week } : old,
                        )
                      }
                      keyboardType="number-pad"
                      maxLength={2}
                    />
                    <Field
                      label="Day of week (1–7)"
                      value={sessionEditor.day}
                      onChangeText={(day) =>
                        setSessionEditor((old) => (old ? { ...old, day } : old))
                      }
                      keyboardType="number-pad"
                      maxLength={1}
                    />
                    <Field
                      label="Coaching notes"
                      value={sessionEditor.notes}
                      onChangeText={(notes) =>
                        setSessionEditor((old) =>
                          old ? { ...old, notes } : old,
                        )
                      }
                      multiline
                      maxLength={1000}
                    />
                    {intervals.map((key) => (
                      <Field
                        key={key}
                        label={intervalLabels[key]}
                        value={sessionEditor.values[key]}
                        onChangeText={(value) =>
                          setSessionEditor((old) =>
                            old
                              ? {
                                  ...old,
                                  values: { ...old.values, [key]: value },
                                }
                              : old,
                          )
                        }
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                    ))}
                    <Txt size="caption" color={c.muted}>
                      Use 0 to omit warm up, recovery or cool down. Recovery
                      runs between work repetitions.
                    </Txt>
                    <Button
                      title="Keep session in draft"
                      onPress={saveSession}
                    />
                    <Button
                      title="Cancel session changes"
                      variant="quiet"
                      onPress={() => setSessionEditor(null)}
                    />
                  </Stack>
                ) : (
                  <>
                    {editor.program.sessions.slice(0, 100).map((session) => (
                      <Stack key={session.id} gap={4}>
                        <ListRow
                          title={session.title}
                          detail={`Week ${session.week} · Day ${session.day}`}
                          onPress={() => openSession(session)}
                        />
                        <Button
                          title={`Remove ${session.title}`}
                          variant="quiet"
                          disabled={!!pending}
                          onPress={() =>
                            confirm(
                              "Remove session?",
                              "Remove this session from the draft? Save the program to keep the change.",
                              () =>
                                update({
                                  sessions: editor.program.sessions.filter(
                                    (s) => s.id !== session.id,
                                  ),
                                }),
                              true,
                            )
                          }
                        />
                      </Stack>
                    ))}
                    <Button
                      title="Add scheduled session"
                      variant="secondary"
                      onPress={() => openSession()}
                      disabled={
                        !!pending || editor.program.sessions.length >= 100
                      }
                    />
                    <Button
                      title="Save draft"
                      onPress={save}
                      disabled={!!pending}
                      loading={pending === "Saving draft"}
                    />
                    <Button
                      title="Cancel program changes"
                      variant="quiet"
                      disabled={!!pending}
                      onPress={() =>
                        confirm(
                          "Discard changes?",
                          "Discard these unsaved program changes?",
                          () => {
                            setEditor(null);
                            setSessionEditor(null);
                            setError("");
                          },
                        )
                      }
                    />
                  </>
                )}
              </SettingsSection>
            ) : (
              <>
                {tab === "library" ? (
                  <SettingsSection title="Published programs">
                    {!creatorTrainingCloudConfigured ? (
                      <Txt color={c.muted}>
                        The public library needs a configured RIVL cloud
                        connection. You can create local drafts and import or
                        export programs now.
                      </Txt>
                    ) : (
                      <>
                        {libraryLoading && (
                          <View accessibilityLiveRegion="polite">
                            <Txt color={c.muted}>
                              Loading published programs…
                            </Txt>
                          </View>
                        )}
                        {!!libraryError && (
                          <Notice
                            text={libraryError}
                            retry={() => setRevision((n) => n + 1)}
                          />
                        )}
                        {librarySettled && !library.length && (
                          <Txt color={c.muted}>
                            No published programs are available yet.
                          </Txt>
                        )}
                        {library.slice(0, 20).map((program) => (
                          <ListRow
                            key={program.id}
                            title={program.title}
                            detail={`${program.creatorName} · ${sportLabels[program.sport]} · ${program.weeks} weeks`}
                            onPress={() => {
                              setPreview(program);
                              setImportOpen(false);
                            }}
                          />
                        ))}
                        {librarySettled && (
                          <Txt size="caption" color={c.muted}>
                            Showing up to 20 newest published programs.
                          </Txt>
                        )}
                      </>
                    )}
                  </SettingsSection>
                ) : (
                  <SettingsSection title="My programs">
                    <Button
                      title="Create program"
                      onPress={() => open()}
                      disabled={!ready || !!pending}
                    />
                    {loadedOwner === owner && !programs.length && ready && (
                      <Txt color={c.muted}>
                        Your saved drafts and imported programs appear here.
                      </Txt>
                    )}
                    {(loadedOwner === owner ? programs : [])
                      .slice(0, 100)
                      .map((program) => (
                        <ListRow
                          key={program.id}
                          title={program.title}
                          detail={`${program.weeks} weeks · ${program.sessions.length} sessions · ${program.creatorName}`}
                          onPress={() => {
                            setPreview(program);
                            setImportOpen(false);
                          }}
                        />
                      ))}
                  </SettingsSection>
                )}
                {preview && draftOwner.current === owner && (
                  <SettingsSection title={preview.title}>
                    <Txt>{preview.description}</Txt>
                    <Txt color={c.muted}>
                      {preview.creatorName} · {sportLabels[preview.sport]} ·{" "}
                      {preview.level} · {preview.weeks} weeks
                    </Txt>
                    <Txt size="caption" color={c.muted}>
                      License: {preview.license}. Keep required attribution when
                      sharing. Coaching notes are creator content; choose
                      sessions that suit you.
                    </Txt>
                    {"attribution" in preview &&
                      preview.attribution?.map((credit, index) => (
                        <Txt key={index} size="caption" color={c.muted}>
                          {credit.creatorName} · {credit.title} ·{" "}
                          {credit.license}
                        </Txt>
                      ))}
                    {"origin" in preview &&
                      preview.origin?.attribution?.map((credit, index) => (
                        <Txt key={index} size="caption" color={c.muted}>
                          {credit.creatorName} · {credit.title} ·{" "}
                          {credit.license}
                        </Txt>
                      ))}
                    {preview.sessions.slice(0, 100).map((session) => (
                      <Stack key={session.id} gap={8}>
                        <Txt weight="600">
                          Week {session.week} · Day {session.day}:{" "}
                          {session.title}
                        </Txt>
                        {!!session.notes && (
                          <Txt color={c.muted}>{session.notes}</Txt>
                        )}
                        <Txt size="caption" color={c.muted}>
                          {session.workout.repeats} × {session.workout.workSec}s
                          work · {session.workout.recoverySec}s recovery ·{" "}
                          {session.workout.warmupSec}s warm up ·{" "}
                          {session.workout.cooldownSec}s cool down
                        </Txt>
                        {"ownerId" in preview && preview.ownerId === owner && (
                          <Button
                            title={`Start ${session.title}`}
                            variant="secondary"
                            disabled={!ready || !!pending}
                            onPress={() => startSession(preview, session.id)}
                          />
                        )}
                      </Stack>
                    ))}
                    {"ownerId" in preview && preview.ownerId === owner ? (
                      <>
                        {!!preview.origin && (
                          <Txt size="caption" color={c.muted}>
                            Adapted from {preview.origin.creatorName} ·{" "}
                            {preview.origin.title} · {preview.origin.license}
                          </Txt>
                        )}
                        <Button
                          title="Edit program"
                          variant="secondary"
                          disabled={!!pending}
                          onPress={() => open(preview)}
                        />
                        <Button
                          title="Export program JSON"
                          variant="secondary"
                          disabled={!!pending}
                          onPress={() =>
                            void perform("Exporting program", async () => {
                              await Share.share({
                                message: encodeCreatorProgram(preview),
                              });
                            })
                          }
                        />
                        {!!preview.origin && (
                          <Txt size="caption" color={c.muted}>
                            Imported adaptations can be kept and exported with
                            their attribution. Publishing is available for
                            original programs.
                          </Txt>
                        )}
                        <Button
                          title="Publish program"
                          disabled={
                            !!pending ||
                            !creatorTrainingCloudConfigured ||
                            !!preview.origin
                          }
                          onPress={() =>
                            confirm(
                              "Publish openly?",
                              `I confirm this program is my original work or I have permission to publish it under ${preview.license}. The creator name, program, schedule and notes will be public and reusable under that license.`,
                              () =>
                                void perform("Publishing program", () =>
                                  publishCreatorProgram(preview),
                                ),
                            )
                          }
                        />
                        <Button
                          title="Unpublish program"
                          variant="quiet"
                          disabled={
                            !!pending || !creatorTrainingCloudConfigured
                          }
                          onPress={() =>
                            confirm(
                              "Unpublish program?",
                              "Remove this program from the public library? Copies already downloaded or shared remain usable under their license.",
                              () =>
                                void perform("Unpublishing program", () =>
                                  unpublishCreatorProgram(preview.id),
                                ),
                            )
                          }
                        />
                        <Button
                          title="Delete local program"
                          variant="danger"
                          disabled={!!pending}
                          onPress={() =>
                            confirm(
                              "Delete local program?",
                              "Remove this saved program from this account? Unpublish first if you also want to remove the public listing. An active timer keeps its own session copy.",
                              () =>
                                void perform(
                                  "Deleting program",
                                  () => repository.remove(preview),
                                  () => setPreview(null),
                                ),
                              true,
                            )
                          }
                        />
                      </>
                    ) : (
                      <Button
                        title="Save a copy to My programs"
                        disabled={!ready || !!pending}
                        onPress={() =>
                          void perform(
                            "Saving program copy",
                            async (id) => {
                              await repository.adopt(id, preview, randomUUID());
                            },
                            () => {
                              setPreview(null);
                              setImportOpen(false);
                              setJson("");
                              setTab("mine");
                            },
                          )
                        }
                      />
                    )}
                    <Button
                      title="Close preview"
                      variant="quiet"
                      disabled={!!pending}
                      onPress={() => setPreview(null)}
                    />
                  </SettingsSection>
                )}
                <SettingsSection title="Import a shared program" collapsible>
                  <Txt color={c.muted}>
                    Paste a RIVL program JSON export. Preview its sessions and
                    license before saving your own copy. Importing never starts
                    a timer.
                  </Txt>
                  <Field
                    label="Program JSON"
                    value={draftOwner.current === owner ? json : ""}
                    onChangeText={(value) => {
                      setJson(value);
                      if (importOpen) setPreview(null);
                      setImportOpen(true);
                    }}
                    multiline
                    maxLength={200000}
                    editable={!pending}
                  />
                  <Button
                    title="Preview import"
                    variant="secondary"
                    disabled={!ready || !!pending || !json.trim()}
                    onPress={() => {
                      setImportOpen(true);
                      previewImport();
                    }}
                  />
                </SettingsSection>
              </>
            )}
          </>
        )}
        <SettingsSection title="Open training resources" collapsible>
          <Txt color={c.muted}>
            Explore open source tools and workouts. These links open the
            original projects; they are not imported into your library.
          </Txt>
          <ListRow
            title="OpenHIIT"
            detail="Open source interval timer and workout builder"
            onPress={() =>
              void Linking.openURL("https://github.com/a-mabe/OpenHIIT").catch(
                (e) => setError(userMessage(e)),
              )
            }
          />
          <ListRow
            title="wger"
            detail="Exercise library and routine tools · check each entry’s content license"
            onPress={() =>
              void Linking.openURL(
                "https://github.com/wger-project/wger",
              ).catch((e) => setError(userMessage(e)))
            }
          />
          <ListRow
            title="Zwift workouts"
            detail="Structured cycling workouts · ZWO and power targets are not supported by this importer"
            onPress={() =>
              void Linking.openURL(
                "https://github.com/robiningelbrecht/zwift-workouts",
              ).catch((e) => setError(userMessage(e)))
            }
          />
        </SettingsSection>
      </Stack>
    </Screen>
  );
}
