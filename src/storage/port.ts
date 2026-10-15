import type { Sample } from "../domain/types";
export interface Database {
  commit(values: Record<string, unknown>, removeKeys?: string[]): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
  list<T>(prefix: string): Promise<T[]>;
  appendSamples(id: string, samples: Sample[]): Promise<void>;
  commitSamples(
    id: string,
    samples: Sample[],
    values: Record<string, unknown>,
  ): Promise<void>;
  samples(id: string): Promise<Sample[]>;
  samplesSince(id: string, after: number, limit?: number): Promise<Sample[]>;
  deleteSamples(id: string): Promise<void>;
}
export class MemoryDatabase implements Database {
  data = new Map<string, unknown>();
  tracks = new Map<string, Sample[]>();
  async commit(values: Record<string, unknown>, removeKeys: string[] = []) {
    const copied = structuredClone(values);
    for (const key of removeKeys) this.data.delete(key);
    for (const [key, value] of Object.entries(copied))
      this.data.set(key, value);
  }
  async get<T>(k: string) {
    return structuredClone((this.data.get(k) as T) ?? null);
  }
  async set<T>(k: string, v: T) {
    this.data.set(k, structuredClone(v));
  }
  async remove(k: string) {
    this.data.delete(k);
  }
  async removePrefix(prefix: string) {
    for (const key of this.data.keys())
      if (key.startsWith(prefix)) this.data.delete(key);
  }
  async list<T>(p: string) {
    return [...this.data]
      .filter(([k]) => k.startsWith(p))
      .map(([, v]) => structuredClone(v) as T);
  }
  async appendSamples(id: string, points: Sample[]) {
    const map = new Map((this.tracks.get(id) ?? []).map((p) => [p.t, p]));
    points.forEach((p) => map.set(p.t, p));
    this.tracks.set(
      id,
      [...map.values()].sort((a, b) => a.t - b.t),
    );
  }
  async samples(id: string) {
    return structuredClone(this.tracks.get(id) ?? []);
  }
  async samplesSince(id: string, after: number, limit = 1000) {
    return (this.tracks.get(id) ?? [])
      .filter((p) => p.t > after)
      .slice(0, limit);
  }
  async commitSamples(
    id: string,
    points: Sample[],
    values: Record<string, unknown>,
  ) {
    await this.appendSamples(id, points);
    for (const [key, value] of Object.entries(values))
      await this.set(key, value);
  }
  async deleteSamples(id: string) {
    this.tracks.delete(id);
  }
}
