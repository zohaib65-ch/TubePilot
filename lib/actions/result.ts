export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
