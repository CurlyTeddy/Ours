import { auth } from "@/features/auth/auth";

export default auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|$).*)"],
};
