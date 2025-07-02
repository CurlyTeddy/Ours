import NextAuth from "next-auth";
import type { NextAuthConfig, User, Session } from "next-auth";
import type { AdapterUser, AdapterSession } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/database-client";
import bcrypt from "bcryptjs";
import { JWT } from "next-auth/jwt";

export const { auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ request: { nextUrl }, auth }) {
      const isLoggedIn = !!auth?.user;
      if (nextUrl.pathname.startsWith("/api")) {
        return isLoggedIn ? NextResponse.next() : NextResponse.json(
          { message: "Unauthorized" },
          { status: 401 },
        );
      }

      if (nextUrl.pathname !== "/login" && nextUrl.pathname !== "/signup") {
        return isLoggedIn;
      }
      
      if (isLoggedIn) {
        return NextResponse.redirect(new URL("/moments", nextUrl));
      }
      
      return true;
    },
    jwt({ token, user } : { token: JWT; user?: User | AdapterUser }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token } : { session: { user: AdapterUser;} & AdapterSession & Session, token?: JWT }) {
      if (token) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      async authorize(credentials): Promise<User | null> {
        const parsedCredentials = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        }).safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const { email, password } = parsedCredentials.data;
        const user = await prisma.user.findUnique({
          where: { email: email }
        });

        if (!user || !await bcrypt.compare(password, user.password)) {
          return null;
        }

        return {
          id: user.userId,
          name: user.name,
          email: user.email,
        };
      }
    })
  ],
} satisfies NextAuthConfig);