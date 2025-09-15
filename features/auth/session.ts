import prisma from "@/lib/database-client";
import { sha256 } from "@oslojs/crypto/sha2";
import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from "@oslojs/encoding";

interface Session {
  sessionId: string;
  userId: string;
  expireAt: Date;
}

interface User {
  name: string;
  id: string;
  email: string;
  password: string;
  image: string | null;
}

async function validateSessionToken(
  token: string | undefined,
): Promise<{ session: Session | null; user: User | null }> {
  if (token === undefined) {
    return { session: null, user: null };
  }

  try {
    const sessionId = encodeHexLowerCase(
      sha256(new TextEncoder().encode(token)),
    );
    const data = await prisma.session.findUnique({
      where: { sessionId: sessionId },
      include: { user: true },
    });

    if (data === null) {
      return { session: null, user: null };
    }

    let { user, ...session } = data;
    const now = Date.now();
    if (now >= session.expireAt.getTime()) {
      await prisma.session.delete({
        where: { sessionId: sessionId },
      });

      return { session: null, user: null };
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    if (now >= session.expireAt.getTime() - millisecondsPerDay * 15) {
      const updatedSession = await prisma.session.update({
        where: { sessionId: sessionId },
        data: { expireAt: new Date(now + millisecondsPerDay * 30) },
        include: { user: true },
      });

      user = updatedSession.user;
      session = updatedSession;
    }

    return { session, user: { ...user, id: user.userId } };
  } catch (error) {
    console.error(error);
    return { session: null, user: null };
  }
}

function generateSessionToken(): string {
  const tokenBytes = new Uint8Array(20);
  crypto.getRandomValues(tokenBytes);
  const token = encodeBase32LowerCaseNoPadding(tokenBytes).toLowerCase();
  return token;
}

export { validateSessionToken, generateSessionToken };
