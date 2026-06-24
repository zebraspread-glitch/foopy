// Small HTTP helpers for API routes.

/**
 * Parse a request's JSON body, ALWAYS returning a plain object — never throws.
 * A missing, empty, malformed, or non-object body (e.g. `null`, a bare string,
 * or an array) becomes `{}`, so route handlers can rely on their own field
 * validation instead of crashing with an unhandled 500.
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
