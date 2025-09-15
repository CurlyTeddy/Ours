"use server";

import { z } from "zod/v4";
import prisma from "@/lib/database-client";
import { redirect } from "next/navigation";
import { createId } from "@paralleldrive/cuid2";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { generateSessionToken } from "@/features/auth/session";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";

export async function authenticate(
  previousState: string | undefined,
  formData: FormData,
) {
  const parsedCredentials = z
    .object({
      email: z.email(),
      password: z.string().min(8),
    })
    .safeParse(Object.fromEntries(formData));

  if (!parsedCredentials.success) {
    return "Invalid credential format.";
  }

  const { email, password } = parsedCredentials.data;
  const user = await prisma.user.findUnique({
    where: { email: email },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return "Invalid credential.";
  }

  const token = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      sessionId: encodeHexLowerCase(sha256(new TextEncoder().encode(token))),
      userId: user.userId,
      expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  const cookiesStore = await cookies();
  cookiesStore.set("session", token, {
    httpOnly: true,
    path: "/",
    secure: env.NEXT_PUBLIC_ENVIRONMENT === "prod",
    sameSite: "lax",
    expires: session.expireAt,
  });

  const redirectTo = formData.get("redirectTo");
  const redirectUrl = typeof redirectTo === "string" ? redirectTo : "/moments";
  redirect(redirectUrl);
}

export async function signOutAction() {
  const cookiesStore = await cookies();
  const token = cookiesStore.get("session");
  if (token === undefined) {
    console.info("User probably deletes session token manully.");
    return;
  }

  await prisma.session.delete({
    where: {
      sessionId: encodeHexLowerCase(
        sha256(new TextEncoder().encode(token.value)),
      ),
    },
  });
  cookiesStore.delete("session");
  redirect("/login");
}

export interface State {
  errors?: {
    errors: string[];
    properties?: {
      email?: {
        errors: string[];
      };
      username?: {
        errors: string[];
      };
      password?: {
        errors: string[];
      };
      inviteCode?: {
        errors: string[];
      };
    };
  };
  message?: string | undefined;
}

export async function register(
  previousState: State,
  formData: FormData,
): Promise<State> {
  const parsedCredentials = z
    .object({
      email: z.email("Invalid email address."),
      username: z
        .string()
        .min(6)
        .regex(/^[a-z0-9]+$/, "Username must be lower case and alphanumeric."),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters long."),
      inviteCode: z.string(),
    })
    .safeParse({
      email: formData.get("email"),
      username: formData.get("username"),
      password: formData.get("password"),
      inviteCode: formData.get("inviteCode"),
    });

  if (!parsedCredentials.success) {
    return {
      errors: z.treeifyError(parsedCredentials.error),
      message: "Incorrect form format. Please check your input.",
    };
  }

  const { email, username, password, inviteCode } = parsedCredentials.data;
  const now = new Date();
  try {
    const userId = createId();
    const codeError = await prisma.$transaction(async (txn) => {
      const code = await txn.inviteCode.findFirst({
        where: { code: inviteCode },
      });
      if (!code || code.usedAt !== null || code.expireAt < now) {
        return {
          errors: {
            errors: ["Invalid invite code."],
            properties: {
              inviteCode: {
                errors: ["Invalid invite code."],
              },
            },
          },
          message: "Invalid invite code. Please check your input.",
        };
      }
      await txn.inviteCode.update({
        where: { code: inviteCode },
        data: { usedAt: now, usedById: userId },
      });
      const hashedPassword = await bcrypt.hash(password, 10);
      await txn.user.create({
        data: { userId, email, name: username, password: hashedPassword },
      });
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
