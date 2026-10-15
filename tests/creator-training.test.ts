import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { CreatorTrainingRepository } from "../src/services/creator-training-repository";
import {
  validateCreatorProgram,
  encodeCreatorProgram,
  decodeCreatorProgram,
  creatorSessionPlan,
  CREATOR_PROGRAM_LIMITS,
  type CreatorProgram,
} from "../src/domain/creator-training";
const program = (id = "program"): CreatorProgram => ({
  id,
  ownerId: "me",
  creatorName: "Original creator",
  title: "My multiweek training",
  description: "User-authored interval progression",
  sport: "run",
  level: "all",
  weeks: 4,
  revision: 1,
  updatedAt: 1000,
  license: "CC-BY-4.0",
  sessions: [
    {
      id: "session-private-identifier",
      week: 1,
      day: 1,
      title: "Easy intervals",
      notes: "Choose your own pace",
      workout: {
        warmupSec: 30,
        workSec: 60,
        recoverySec: 30,
        repeats: 3,
        cooldownSec: 30,
      },
    },
  ],
});
async function setup() {
  const db = new MemoryDatabase();
  await db.set("session", { userId: "me" });
  return { db, repo: new CreatorTrainingRepository(db) };
}
describe("Creator training programs", () => {
  it("validates bounded multiweek intervals and permits multiple sessions on one day", () => {
    expect(validateCreatorProgram(program()).sessions).toHaveLength(1);
    expect(
      validateCreatorProgram({
        ...program(),
        sessions: [
          ...program().sessions,
          { ...program().sessions[0]!, id: "second" },
        ],
      }).sessions,
    ).toHaveLength(2);
    for (const patch of [
      { weeks: 25 },
      { weeks: 0 },
      { revision: 0 },
      { level: "unknown" },
      { license: "proprietary" },
      { creatorName: "x".repeat(81) },
    ])
      expect(() =>
        validateCreatorProgram({ ...program(), ...patch } as CreatorProgram),
      ).toThrow();
    expect(() =>
      validateCreatorProgram({
        ...program(),
        sessions: [...program().sessions, ...program().sessions],
      }),
    ).toThrow("different identifier");
    expect(() =>
      validateCreatorProgram({
        ...program(),
        sessions: [{ ...program().sessions[0]!, week: 5 }],
      }),
    ).toThrow("Session week");
    expect(() =>
      validateCreatorProgram({
        ...program(),
        sessions: [
          {
            ...program().sessions[0]!,
            workout: { ...program().sessions[0]!.workout, repeats: 51 },
          },
        ],
      }),
    ).toThrow();
  });
  it("exports only safe public content license and attribution without local owner or workout IDs", () => {
    const raw = {
      ...program(),
      privateHealth: { hr: 123 },
      activityId: "private-workout",
    };
    const exported = encodeCreatorProgram(raw);
    const packet = JSON.parse(exported);
    expect(packet).toMatchObject({
      schema: "rivl-training-program",
      version: 1,
      attribution: [{ creatorName: "Original creator", license: "CC-BY-4.0" }],
    });
    expect(packet.program).not.toHaveProperty("ownerId");
    expect(packet.program).not.toHaveProperty("id");
    expect(packet.program.sessions[0].id).toBe("session-1");
    expect(exported).not.toContain("private-workout");
    expect(exported).not.toContain("privateHealth");
    expect(exported).not.toContain("session-private-identifier");
  });
  it("decodes and validates a preview without adopting or trusting injected account fields", () => {
    const packet = JSON.parse(encodeCreatorProgram(program()));
    packet.program.ownerId = "foreign";
    packet.program.id = "foreign";
    packet.program.sessions[0].activityId = "activity";
    const preview = decodeCreatorProgram(JSON.stringify(packet));
    expect(preview.title).toBe(program().title);
    expect(preview).not.toHaveProperty("ownerId");
    expect(preview.sessions[0]).not.toHaveProperty("activityId");
    for (const text of [
      "{bad}",
      JSON.stringify({ ...packet, version: 2 }),
      JSON.stringify({ ...packet, schema: "other" }),
      JSON.stringify({ ...packet, program: { ...packet.program, weeks: 99 } }),
    ])
      expect(() => decodeCreatorProgram(text)).toThrow();
  });
  it("enforces the 200 KB UTF-8 limit and rejects malformed nested sessions", () => {
    expect(() =>
      decodeCreatorProgram(
        " ".repeat(CREATOR_PROGRAM_LIMITS.maxImportBytes + 1),
      ),
    ).toThrow("200 KB");
    expect(() => decodeCreatorProgram("界".repeat(70000))).toThrow("200 KB");
    const packet = JSON.parse(encodeCreatorProgram(program()));
    packet.program.sessions = [null];
    expect(() => decodeCreatorProgram(JSON.stringify(packet))).toThrow(
      "valid training",
    );
  });
  it("converts selected sessions into independent owner interval snapshots", () => {
    const source = program(),
      plan = creatorSessionPlan(
        source,
        source.sessions[0]!.id,
        "adopter",
        "plan-new",
        2000,
      );
    expect(plan).toMatchObject({
      ownerId: "adopter",
      id: "plan-new",
      title: "Easy intervals",
      sport: "run",
      workSec: 60,
      repeats: 3,
      updatedAt: 2000,
    });
    source.sessions[0]!.workout.workSec = 900;
    expect(plan.workSec).toBe(60);
    expect(() =>
      creatorSessionPlan(source, "missing", "adopter", "new"),
    ).toThrow("Choose a session");
  });
  it("saves immutable revisions and rejects concurrent stale edits and deletion", async () => {
    const { db, repo } = await setup(),
      original = program();
    await repo.save(original, null);
    original.sessions[0]!.workout.workSec = 900;
    const saved = (await repo.programs("me"))[0]!;
    expect(saved.sessions[0]!.workout.workSec).toBe(60);
    const other = new CreatorTrainingRepository(db);
    const writes = await Promise.allSettled([
      repo.save({ ...saved, revision: 2, updatedAt: 2000 }, saved),
      other.save({ ...saved, revision: 2, updatedAt: 3000 }, saved),
    ]);
    expect(writes.filter((w) => w.status === "fulfilled")).toHaveLength(1);
    await expect(repo.remove(saved)).rejects.toThrow("changed");
    const current = (await repo.programs("me"))[0]!;
    await expect(
      repo.save({ ...current, revision: 4 }, current),
    ).rejects.toThrow("exactly one");
    await repo.remove(current);
    expect(await repo.programs("me")).toEqual([]);
  });
  it("adopts imported copies with new local owner/id/revision without mutating the original", async () => {
    const { repo } = await setup(),
      preview = decodeCreatorProgram(encodeCreatorProgram(program()));
    const adopted = await repo.adopt("me", preview, "new-local", 2000);
    expect(adopted).toMatchObject({
      id: "new-local",
      ownerId: "me",
      revision: 1,
      updatedAt: 2000,
      origin: {
        creatorName: "Original creator",
        revision: 1,
        license: "CC-BY-4.0",
        importedAt: 2000,
      },
    });
    expect(preview.updatedAt).toBe(1000);
    preview.sessions[0]!.notes = "changed outside";
    expect((await repo.programs("me"))[0]!.sessions[0]!.notes).toBe(
      "Choose your own pace",
    );
  });
  it("retains attribution through edited adopted re-export and re-import", async () => {
    const { repo } = await setup();
    const adopted = await repo.adopt(
      "me",
      decodeCreatorProgram(encodeCreatorProgram(program())),
      "copy",
      2000,
    );
    await repo.save(
      {
        ...adopted,
        creatorName: "Second creator",
        title: "Edited copy",
        revision: 2,
        updatedAt: 3000,
      },
      adopted,
    );
    const saved = (await repo.programs("me"))[0]!,
      preview = decodeCreatorProgram(encodeCreatorProgram(saved));
    expect(preview.attribution?.map((a) => a.creatorName)).toEqual(
      expect.arrayContaining(["Original creator", "Second creator"]),
    );
    const second = await repo.adopt("me", preview, "copy2", 4000);
    expect(second.origin?.attribution?.map((a) => a.creatorName)).toContain(
      "Original creator",
    );
    await expect(
      repo.save({ ...second, origin: undefined, revision: 2 }, second),
    ).rejects.toThrow("original creator");
    await expect(
      repo.save({ ...second, license: "CC0-1.0", revision: 2 }, second),
    ).rejects.toThrow("CC BY");
  });
  it("guards exact owner and cleanup marker, while purge remains possible", async () => {
    const { db, repo } = await setup();
    await repo.save(program(), null);
    await db.set("session", { userId: "other" });
    await expect(repo.save(program("new"), null)).rejects.toThrow(
      "account changed",
    );
    await repo.save({ ...program("other"), ownerId: "other" }, null);
    await db.set("session", { userId: "me" });
    await db.set("account:cleanup", { userId: "me" });
    await expect(repo.save(program("new"), null)).rejects.toThrow(
      "account changed",
    );
    await repo.purge("me");
    expect(await repo.programs("me")).toEqual([]);
    expect(await repo.programs("other")).toHaveLength(1);
  });
  it("bounds programs at 50 and preserves original records on failed writes", async () => {
    class Failing extends MemoryDatabase {
      fail = false;
      override async set<T>(key: string, value: T) {
        if (this.fail) throw new Error("database unavailable");
        return super.set(key, value);
      }
    }
    const db = new Failing();
    await db.set("session", { userId: "me" });
    const repo = new CreatorTrainingRepository(db);
    await repo.save(program(), null);
    const original = (await repo.programs("me"))[0]!;
    db.fail = true;
    await expect(
      repo.save({ ...original, revision: 2 }, original),
    ).rejects.toThrow("database");
    db.fail = false;
    expect((await repo.programs("me"))[0]!.revision).toBe(1);
    for (let i = 1; i < 50; i++)
      await db.set(`creator-training:me:program:p${i}`, program(`p${i}`));
    await expect(repo.save(program("extra"), null)).rejects.toThrow("50 saved");
  });
});
