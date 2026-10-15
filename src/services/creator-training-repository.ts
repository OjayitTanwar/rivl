import type { Database } from "../storage/port";
import { AppFailure } from "../security/errors";
import {
  CREATOR_PROGRAM_LIMITS,
  validateCreatorOwner,
  validateCreatorProgram,
  validatePublicCreatorProgram,
  type CreatorProgram,
  type PublicCreatorProgram,
} from "../domain/creator-training";
const queues = new WeakMap<Database, Map<string, Promise<unknown>>>();
export class CreatorTrainingRepository {
  constructor(private db: Database) {}
  private prefix(owner: string) {
    validateCreatorOwner(owner);
    return `creator-training:${owner}:program:`;
  }
  private mutate<T>(owner: string, work: () => Promise<T>) {
    this.prefix(owner);
    let owners = queues.get(this.db);
    if (!owners) queues.set(this.db, (owners = new Map()));
    const next = (owners.get(owner) ?? Promise.resolve())
      .catch(() => {})
      .then(work);
    owners.set(owner, next);
    void next
      .finally(() => {
        if (owners!.get(owner) === next) owners!.delete(owner);
      })
      .catch(() => {});
    return next;
  }
  private async auth(owner: string) {
    if (
      (await this.db.get<{ userId: string }>("session"))?.userId !== owner ||
      (await this.db.get<{ userId: string }>("account:cleanup"))?.userId ===
        owner
    )
      throw new AppFailure(
        "auth",
        "Your account changed. Reopen Creator studio.",
      );
  }
  async programs(owner: string) {
    return (await this.db.list<CreatorProgram>(this.prefix(owner)))
      .filter((p) => p.ownerId === owner)
      .map(validateCreatorProgram)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  }
  async save(program: CreatorProgram, expected: CreatorProgram | null) {
    const next = validateCreatorProgram(program),
      previous = expected ? validateCreatorProgram(expected) : null;
    return this.mutate(next.ownerId, async () => {
      if (
        previous &&
        (previous.id !== next.id || previous.ownerId !== next.ownerId)
      )
        throw new AppFailure(
          "validation",
          "Choose the same program when editing.",
        );
      const key = this.prefix(next.ownerId) + next.id,
        current = await this.db.get<CreatorProgram>(key);
      if (JSON.stringify(current) !== JSON.stringify(previous))
        throw new AppFailure(
          "validation",
          "This program changed. Reload before saving.",
        );
      if (next.revision !== (previous ? previous.revision + 1 : 1))
        throw new AppFailure(
          "validation",
          "Advance this program by exactly one revision when editing.",
        );
      if (
        !previous &&
        (await this.programs(next.ownerId)).length >=
          CREATOR_PROGRAM_LIMITS.maxPrograms
      )
        throw new AppFailure(
          "validation",
          "You have 50 saved programs. Delete an unused program before adding another.",
        );
      // A copied program retains original licensing attribution even after local edits.
      if (
        previous?.origin &&
        JSON.stringify(previous.origin) !== JSON.stringify(next.origin)
      )
        throw new AppFailure(
          "validation",
          "Keep the original creator attribution on your adopted copy.",
        );
      if (
        previous?.origin?.license === "CC-BY-4.0" &&
        next.license !== "CC-BY-4.0"
      )
        throw new AppFailure(
          "validation",
          "Keep CC BY attribution licensing on this adopted program.",
        );
      await this.auth(next.ownerId);
      await this.db.set(key, next);
      return next;
    });
  }
  async remove(program: CreatorProgram) {
    const previous = validateCreatorProgram(program);
    return this.mutate(previous.ownerId, async () => {
      const key = this.prefix(previous.ownerId) + previous.id;
      if (JSON.stringify(await this.db.get(key)) !== JSON.stringify(previous))
        throw new AppFailure(
          "validation",
          "This program changed. Reload before deleting.",
        );
      await this.auth(previous.ownerId);
      await this.db.remove(key);
    });
  }
  async adopt(
    ownerId: string,
    preview: PublicCreatorProgram,
    newId: string,
    now = Date.now(),
  ): Promise<CreatorProgram> {
    const original = validatePublicCreatorProgram(preview);
    const { attribution, ...safe } = original;
    const adopted = validateCreatorProgram({
      ...safe,
      id: newId,
      ownerId,
      revision: 1,
      updatedAt: now,
      origin: {
        creatorName: original.creatorName,
        title: original.title,
        revision: original.revision,
        license: original.license,
        importedAt: now,
        ...(attribution ? { attribution } : {}),
      },
    });
    return this.save(adopted, null);
  }
  purge(owner: string) {
    return this.mutate(owner, () => this.db.removePrefix(this.prefix(owner)));
  }
}
