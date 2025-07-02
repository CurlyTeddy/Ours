import { auth } from "@/middlewares/auth";

export default auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.png$|$).*)"]
};