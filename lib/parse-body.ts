import { NextResponse } from "next/server";
import type { z } from "zod/v4";
import type { HttpErrorPayload } from "@/lib/error";

// The request's JSON body checked against a schema, or the 400 to answer with.
async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ data: T } | { error: NextResponse<HttpErrorPayload> }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      error: NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 },
      ),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      error: NextResponse.json(
        { message: parsed.error.issues[0].message },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}

export { parseBody };
