import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { preparePrivateFiles } from "../security/private-files";
import { identifier } from "../security/validation";
export async function photoBytes(uri: string): Promise<ArrayBuffer> {
  return (await new File(uri).bytes()).buffer;
}
export async function persistPhoto(
  uri: string,
  ownerId: string,
): Promise<string> {
  identifier(ownerId, "Athlete ID");
  await preparePrivateFiles();
  const directory = FileSystem.documentDirectory + "photos/" + ownerId + "/";
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension =
    uri.match(/\.(jpe?g|png|heic|webp)(?:\?|$)/i)?.[1]?.toLowerCase() ?? "jpg";
  const target = directory + Crypto.randomUUID() + "." + extension;
  await FileSystem.copyAsync({ from: uri, to: target });
  return target;
}
export async function eraseAccountMedia(ownerId: string): Promise<void> {
  identifier(ownerId, "Athlete ID");
  await FileSystem.deleteAsync(FileSystem.documentDirectory + "photos/" + ownerId + "/", { idempotent: true });
}
