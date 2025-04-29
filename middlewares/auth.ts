import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/app/lib/database-client";
import { User } from "@/prisma/generated-client";
import bcrypt from "bcryptjs";

export const { auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ request: { nextUrl }, auth }) {
      const isLogin = !!auth?.user;

      if (nextUrl.pathname.endsWith('/moments')) {
        return isLogin;
      } else if (isLogin) {
        NextResponse.redirect('/moments');
      }

      return true;
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