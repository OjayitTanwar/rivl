import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Resvg } from "@resvg/resvg-js";
const source = await readFile("assets/icon.svg", "utf8");
async function saveRaster(file, bytes, origin) {
  await writeFile(file, bytes);
  await writeFile(`${file}.json`, JSON.stringify({ prompt: origin }, null, 2) + "\n");
}
await mkdir("assets/brand", { recursive: true });
await saveRaster(
  "assets/icon.png",
  new Resvg(source, { font: { loadSystemFonts: false }, fitTo: { mode: "width", value: 1024 } }).render().asPng(),
  "Origin: rendered the existing RIVL vector master assets/icon.svg unchanged at 1024 pixels for the app icon.",
);
for (const size of [64, 128, 256, 512])
  await saveRaster(
    `assets/brand/rivl-app-${size}.png`,
    new Resvg(source, { font: { loadSystemFonts: false }, fitTo: { mode: "width", value: size } }).render().asPng(),
    `Origin: rendered the original RIVL Trail Ribbon vector master assets/icon.svg at ${size} pixels.`,
  );
const path = source.match(
  /<path[^>]*d="([^"]+)"[^>]*\/>/,
)?.[1];
if (!path) throw new Error("RIVL vector master is missing its mark.");
for (const [name, color] of [
  ["light", "#101114"],
  ["dark", "#F5F4EF"],
  ["monochrome", "#000000"],
]) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 1280" width="1024" height="1024"><path d="${path}" fill="${color}" fill-rule="evenodd"/></svg>`;
  await writeFile(`assets/brand/rivl-${name}.svg`, svg);
  for (const size of [16, 32, 64, 128, 256, 512])
    await saveRaster(
      `assets/brand/rivl-${name}-${size}.png`,
      new Resvg(svg, { font: { loadSystemFonts: false }, fitTo: { mode: "width", value: size } })
        .render()
        .asPng(),
      `Origin: rendered the RIVL ${name} vector mark derived from assets/icon.svg at ${size} pixels.`,
    );
}
const pngs = await Promise.all(
  [16, 32].map((size) => readFile(`assets/brand/rivl-light-${size}.png`)),
);
const header = Buffer.alloc(6 + 16 * pngs.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngs.length, 4);
let offset = header.length;
pngs.forEach((data, i) => {
  const p = 6 + i * 16;
  header[p] = i ? 32 : 16;
  header[p + 1] = i ? 32 : 16;
  header.writeUInt16LE(1, p + 4);
  header.writeUInt16LE(32, p + 6);
  header.writeUInt32LE(data.length, p + 8);
  header.writeUInt32LE(offset, p + 12);
  offset += data.length;
});
await writeFile("assets/brand/favicon.ico", Buffer.concat([header, ...pngs]));
