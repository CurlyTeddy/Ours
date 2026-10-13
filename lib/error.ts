import { HTTPError } from "ky";
import { ZodIssue } from "zod";

interface HttpErrorPayload {
  message: string;
  validationIssues?: ZodIssue[];
}

// Our API answers with { message }; other bodies (R2's XML, a gateway's HTML page) fall back.
async function getErrorMessage(
  error: unknown,
  fallback: string,
): Promise<string> {
  if (!(error instanceof HTTPError)) {
    return fallback;
  }

  const payload = await error.response
    .json<HttpErrorPayload>()
    .catch(() => null);
  return payload?.message ?? fallback;
}

export { getErrorMessage };
export type { HttpErrorPayload };
