import { NextResponse } from "next/server";

import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { validateSessionToken } from "@/features/auth/session";

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("session")?.value;

  const { session, user } = await validateSessionToken(token);
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/signup"
  ) {
    if (session !== null && user !== null) {
      return NextResponse.redirect(new URL("/moments", request.url));
    }
    return NextResponse.next();
  }

  if (session === null || user === null) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (request.method === "GET") {
    const response = NextResponse.next();

    // Only extend cookie expiration on GET requests since we are sure
    // a new session wasn't set when handling the request.
    if (token != undefined) {
      response.cookies.set("session", token, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        httpOnly: true,
        secure: env.NEXT_PUBLIC_ENVIRONMENT === "prod",
      });
    }

    return response;
  }

  const originHeader = request.headers.get("Origin");
  const forbiddenResponse = NextResponse.json(
    {
      message:
        "Forbidden request. Please check if the CORS policy is configured correctly.",
    },
    { status: 403 },
  );
  const hostHeader = request.headers.get("Host");
  if (originHeader === null || hostHeader === null) {
    return forbiddenResponse;
  }
  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return forbiddenResponse;
  }
  if (origin.host !== hostHeader) {
    return forbiddenResponse;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|$).*)"],
};
