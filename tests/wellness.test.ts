import { describe, expect, it } from "vitest";
import { MemoryDatabase } from "../src/storage/port";
import { WellnessRepository } from "../src/services/wellness-repository";
import { validateWellnessEntry, wellnessValue, type WellnessEntry } from "../src/domain/wellness";
const now = new Date(2026,9,13,12).getTime();
const entry = (patch: Partial<WellnessEntry> = {}): WellnessEntry => ({id:"record",ownerId:"athlete",kind:"water",value:250,at:now,note:"",...patch});
describe("Private health records", () => {
  it("rejects nonfinite, invalid and fractional count records", () => {
    expect(() => validateWellnessEntry(entry({value:NaN}),now)).toThrow();
    expect(() => validateWellnessEntry(entry({kind:"steps",value:4.5}),now)).toThrow();
    expect(() => validateWellnessEntry(entry({at:now+120000}),now)).toThrow();
  });
  it("counts water and bowel records only in the current local day", () => {
    const records=[entry(),entry({id:"old",at:now-86400000,value:500}),entry({id:"bowel",kind:"bowel",value:4})];
    expect(wellnessValue(records,"water",now)).toBe(250);
    expect(wellnessValue(records,"bowel",now)).toBe(1);
    expect(wellnessValue(records,"weight",now)).toBeNull();
  });
  it("isolates owners and atomically turns a running timer into a history record", async () => {
    const db=new MemoryDatabase(); let clock=now;
    const repo=new WellnessRepository(db,()=>clock);
    await repo.save(entry());
    expect(await repo.list("other")).toEqual([]);
    await repo.startFast("athlete");
    await expect(repo.startFast("athlete")).rejects.toThrow();
    clock+=3600000;
    await repo.finishFast("athlete","fast-1");
    expect(await repo.activeFast("athlete")).toBeNull();
    expect((await repo.list("athlete")).find(e=>e.kind==="fasting")?.value).toBe(1);
    await repo.remove("other","record");
    expect(await repo.list("athlete")).toHaveLength(2);
  });
});
