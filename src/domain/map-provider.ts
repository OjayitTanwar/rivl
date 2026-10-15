/** Fail closed for unknown/Google provenance; a token alone is not permission. */
export function useMapboxFallback(
  allowed: boolean | undefined,
  token: string,
  googleKey: string,
  googleFailed: boolean,
): boolean {
  return (
    allowed === true && token.startsWith("pk.") && (!googleKey || googleFailed)
  );
}
