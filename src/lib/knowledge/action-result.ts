/** Every Knowledge Base action can return either a success payload or `{error, code}` — this reads the error out of that union without TypeScript's `"x" in y` narrowing tripping over the wide `{}` success shape some of these actions infer. */
export function getActionErrorMessage(result: unknown): string | undefined {
  if (result && typeof result === "object" && "error" in result && typeof (result as { error: unknown }).error === "string") {
    return (result as { error: string }).error;
  }
  return undefined;
}
