"use server";

import { signIn, signOut } from "@/middlewares/auth";
import { AuthError } from "next-auth";
import { z } from "zod";
import prisma from "@/lib/database-client";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";

export async function authenticate(previousState: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials.";
        default:
          return "An unexpected error occurred. Please try again later.";
      }
    }

    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: '/' });
}

export interface State {
  errors?: {
    email?: string[];
    username?: string[];
    password?: string[];
    inviteCode?: string[];
  },
  message?: string | null;
}

export async function register(previousState: State, formData: FormData): Promise<State> {
  const parsedCredentials = z.object({
    email: z.string().email("Invalid email address."),
    username: z.string().min(6).regex(/^[a-z0-9]+$/, "Username must be lower case and alphanumeric."),
    password: z.string().min(8, "Password must be at least 8 characters long."),
    inviteCode: z.string(),
  }).safeParse({
    email: formData.get("email"),
    username: formData.get("username"),
    password: formData.get("password"),
    inviteCode: formData.get("inviteCode"),
  });

  if (!parsedCredentials.success) {
    return {
      errors: parsedCredentials.error.flatten().fieldErrors,
      message: "Incorrect form format. Please check your input.",
    };
  }

  const { email, username, password, inviteCode } = parsedCredentials.data;
  const now = new Date();
  try {
    const userId = createId();
    const codeError =  await prisma.$transaction(async txn => {
      const code = await txn.inviteCode.findFirst({ where: { code: inviteCode } });
      if (!code || code.usedAt !== null || code.expireAt < now) {
        return {
          errors: { inviteCode: ["Invalid invite code."] },
          message: "Invalid invite code. Please check your input.",
        };
      }
      await txn.inviteCode.update({ where: { code: inviteCode }, data: { usedAt: now, usedById: userId } });
      const hashedPassword = await bcrypt.hash(password, 10);
      await txn.user.create({ data: { userId, email, name: username, password: hashedPassword } });
    });

    if (codeError) {
      return codeError;
    }
  } catch (error) {
    console.error(error);
    return {
      message: "Database error: Failed to create a user.",
    };
  }
  
  redirect("/login");
}