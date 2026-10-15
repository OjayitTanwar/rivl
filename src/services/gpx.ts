import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as Picker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import { exportGPX, importGPX } from "../domain/gpx";
import type { Sample, Sport, RoutePlan } from "../domain/types";
import { distance } from "../domain/geo";
export async function shareGPX(
  name: string,
  points: Sample[],
  recorded = false,
) {
  const file = new File(Paths.cache, "rivl-export.gpx");
  file.write(exportGPX(name, points, recorded));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/gpx+xml",
      UTI: "com.topografix.gpx",
      dialogTitle: "Export route",
    });
  } finally {
    if (file.exists) file.delete();
  }
}
export async function pickGPX(sport: Sport): Promise<RoutePlan | null> {
  const result = await Picker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0]!,
    file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size ?? 0) > 4_000_000)
      throw new Error("Choose a GPX file under 4 MB.");
    const { name, points } = importGPX(await file.text());
    let meters = 0,
      ascent = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      if (a.segment !== b.segment) continue;
      meters += distance(a, b);
      if (a.altitude !== undefined && b.altitude !== undefined)
        ascent += Math.max(0, b.altitude - a.altitude);
    }
    return {
      id: Crypto.randomUUID(),
      name,
      sport,
      points,
      distance: meters,
      ascent,
      surface: "Imported GPX; check paths and access locally",
      saved: true,
      routing: "recorded",
    };
  } finally {
    if (file.exists) file.delete();
  }
}
