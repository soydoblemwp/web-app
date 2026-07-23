import "server-only";

export class GitHubConnectionError extends Error {}

/** Verifies a GitHub personal access token against the fixed, non-user-controlled api.github.com host. */
export async function verifyGitHubToken(token: string): Promise<{ login: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "AIContentHub-Integration",
        Accept: "application/vnd.github+json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new GitHubConnectionError(
        response.status === 401 ? "Token de GitHub no válido." : `GitHub respondió con estado ${response.status}.`
      );
    }
    const data = (await response.json()) as { login: string };
    return { login: data.login };
  } catch (error) {
    if (error instanceof GitHubConnectionError) throw error;
    throw new GitHubConnectionError("No se pudo conectar con GitHub.");
  } finally {
    clearTimeout(timeout);
  }
}
