import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/database-client";
import { User } from "@/prisma/generated-client";
import bcrypt from "bcryptjs";

export const { auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ request: { nextUrl }, auth }) {
      const isLoggedIn = !!auth?.user;
      if (isLoggedIn && (nextUrl.pathname === "/login" || nextUrl.pathname === "/signup")) {
        return NextResponse.redirect(new URL("/moments", nextUrl));
      }
      return isLoggedIn;
    }
  },
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }).safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const { email, password } = parsedCredentials.data;
        const user: User | null = await prisma.user.findUnique({
          where: { email: email }
        });

        if (!user || !await bcrypt.compare(password, user.password)) {
          return null;
        }

        return user;
      }
    })
  ],
} satisfies NextAuthConfig);