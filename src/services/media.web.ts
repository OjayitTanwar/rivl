export async function persistPhoto(uri: string): Promise<string> {
  const response = await fetch(uri),
    blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
export async function photoBytes(uri: string): Promise<ArrayBuffer> {
  return (await fetch(uri)).arrayBuffer();
}
export async function eraseAccountMedia(_ownerId: string): Promise<void> {}
