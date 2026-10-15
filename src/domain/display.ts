/** Preserve extrema in each pixel bucket; charts never send an unbounded SVG path. */
export function chartSamples(
  values: number[],
  limit = 512,
): { index: number; value: number }[] {
  if (values.length <= limit)
    return values
      .map((value, index) => ({ index, value }))
      .filter((p) => Number.isFinite(p.value));
  const output: { index: number; value: number }[] = [];
  const width = Math.ceil(values.length / Math.floor(limit / 2));
  for (let offset = 0; offset < values.length; offset += width) {
    let low = -1,
      high = -1;
    for (let i = offset; i < Math.min(values.length, offset + width); i++) {
      if (!Number.isFinite(values[i])) continue;
      if (low < 0 || values[i]! < values[low]!) low = i;
      if (high < 0 || values[i]! > values[high]!) high = i;
    }
    for (const index of [...new Set([low, high])]
      .filter((i) => i >= 0)
      .sort((a, b) => a - b))
      output.push({ index, value: values[index]! });
  }
  return output;
}
